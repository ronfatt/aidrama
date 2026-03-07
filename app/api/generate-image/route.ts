import { NextResponse } from "next/server";
import { z } from "zod";

const generateImageSchema = z.object({
  imagePrompt: z.string().min(8).max(4000),
  sceneNumber: z.number().int().positive(),
  useReferenceImage: z.boolean(),
  referenceTag: z.string().optional().or(z.literal("")),
  style: z.string().min(1),
  strictMode: z.boolean().optional(),
  continuitySeed: z.string().min(1).max(200).optional(),
});

function buildLockedImagePrompt(input: z.infer<typeof generateImageSchema>): string {
  const locks = [
    "single clearly visible character",
    "Singapore location realism",
    "cinematic photorealistic 35mm still",
    "natural but moody lighting",
    "no western suburban architecture",
  ];

  if (input.useReferenceImage && input.referenceTag?.trim()) {
    locks.push(`keep character identity consistent with reference tag ${input.referenceTag.trim()}`);
    locks.push("avoid changing facial identity across scenes");
  }

  if (input.continuitySeed) {
    locks.push(`continuity seed ${input.continuitySeed}`);
  }

  if (input.strictMode !== false) {
    locks.push("strict continuity mode");
  }

  return `${input.imagePrompt}. Style: ${input.style}. Locks: ${locks.join(", ")}. Output a single best frame.`;
}

function findInlineImageData(node: unknown): { mimeType: string; data: string } | null {
  if (!node || typeof node !== "object") return null;

  const candidate = node as Record<string, unknown>;

  const inline = (candidate.inlineData || candidate.inline_data) as Record<string, unknown> | undefined;
  if (inline && typeof inline.data === "string") {
    const mimeType = typeof inline.mimeType === "string" ? inline.mimeType : "image/png";
    return { mimeType, data: inline.data };
  }

  for (const value of Object.values(candidate)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findInlineImageData(item);
        if (found) return found;
      }
    } else {
      const found = findInlineImageData(value);
      if (found) return found;
    }
  }

  return null;
}

async function generateWithModel(apiKey: string, model: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.error as { message?: string })?.message) ||
      "Gemini image generation failed.";
    return { ok: false as const, error: message };
  }

  const image = findInlineImageData(data);
  if (!image) {
    return { ok: false as const, error: "No image returned by Gemini." };
  }

  return {
    ok: true as const,
    imageDataUrl: `data:${image.mimeType};base64,${image.data}`,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = generateImageSchema.parse(body);

    const apiKey = process.env.GEMINI_API_KEY;
    const primaryModel = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
    const fallbackModel = process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-2.5-flash-image-preview";

    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY environment variable." }, { status: 500 });
    }

    const prompt = buildLockedImagePrompt(payload);
    const models = Array.from(new Set([primaryModel, fallbackModel]));

    let lastError = "Gemini image generation failed.";

    for (const model of models) {
      const result = await generateWithModel(apiKey, model, prompt);
      if (result.ok) {
        return NextResponse.json({ imageDataUrl: result.imageDataUrl, modelUsed: model });
      }
      lastError = `${lastError} [${model}] ${result.error}`;
    }

    return NextResponse.json({ error: lastError }, { status: 502 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid image generation request." }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Unexpected image generation error." }, { status: 500 });
  }
}
