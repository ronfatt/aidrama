import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const generateImageSchema = z.object({
  imagePrompt: z.string().min(8).max(4000),
  sceneNumber: z.number().int().positive(),
  projectMode: z.string().optional().or(z.literal("")),
  useReferenceImage: z.boolean(),
  referenceTag: z.string().optional().or(z.literal("")),
  style: z.string().min(1),
  colorGradePreset: z.string().min(1).max(80).optional(),
  lightingColor: z.string().min(1).max(300).optional(),
  projectColorGradeLock: z.string().min(1).max(300).optional(),
  strictMode: z.boolean().optional(),
  continuitySeed: z.string().min(1).max(200).optional(),
  masterReferenceImages: z.array(z.string().min(10)).max(8).optional(),
});

type Provider = "gemini" | "kling";
type KlingTaskStatus = "submitted" | "processing" | "succeeded" | "failed";

async function fetchJsonWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = {};

    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Upstream request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildLockedImagePrompt(input: z.infer<typeof generateImageSchema>): string {
  const locationLock =
    input.projectMode === "tawau-sabah-realism"
      ? "Tawau Sabah modern civic location realism"
      : input.projectMode === "coastal-fantasy-drama"
        ? "Southeast Asian coastal fantasy realism"
        : "Singapore location realism";
  const locks = [
    "single clearly visible character",
    locationLock,
    "cinematic photorealistic 35mm still",
    "16:9 widescreen frame only",
    "natural but moody lighting",
    "no western suburban architecture",
    "keep color grading consistent with the same project palette",
    "do not swing between cool cyan grading and warm amber grading across scenes unless explicitly required",
    input.projectMode === "tawau-sabah-realism"
      ? "prefer modern, cleaner, maintained Tawau civic and town architecture, avoid retro or run-down building reads unless explicitly required"
      : "",
  ].filter(Boolean);

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

  if ((input.masterReferenceImages || []).length > 0) {
    locks.push("must match identity in provided master reference images");
  }

  const colorNotes = [
    input.colorGradePreset ? `Color grade preset: ${input.colorGradePreset}` : "",
    input.projectColorGradeLock ? `Project color grade lock: ${input.projectColorGradeLock}` : "",
    input.lightingColor ? `Scene lighting/color target: ${input.lightingColor}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return `${input.imagePrompt}. Style: ${input.style}. ${colorNotes ? `${colorNotes}. ` : ""}Locks: ${locks.join(
    ", "
  )}. Output a single best frame in 16:9 widescreen.`;
}

function parseDataUrlImage(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
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

function findStringImageUrl(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;

  const candidate = node as Record<string, unknown>;
  const directUrl = candidate.url;
  if (typeof directUrl === "string" && /^https?:\/\//i.test(directUrl)) {
    return directUrl;
  }

  for (const value of Object.values(candidate)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findStringImageUrl(item);
        if (found) return found;
      }
    } else {
      const found = findStringImageUrl(value);
      if (found) return found;
    }
  }

  return null;
}

function extractKlingResultUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data as Record<string, unknown> | undefined) || root;
  const taskResult = (data.task_result as Record<string, unknown> | undefined) || {};

  const images = taskResult.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (item && typeof item === "object") {
        const url = (item as Record<string, unknown>).url;
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          return url;
        }
      }
    }
  }

  const seriesImages = taskResult.series_images;
  if (Array.isArray(seriesImages)) {
    for (const item of seriesImages) {
      if (item && typeof item === "object") {
        const url = (item as Record<string, unknown>).url;
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          return url;
        }
      }
    }
  }

  return null;
}

function findBase64Image(node: unknown): { mimeType: string; data: string } | null {
  if (!node || typeof node !== "object") return null;

  const candidate = node as Record<string, unknown>;
  const keys = ["b64_json", "base64", "image_base64", "imageBase64"];

  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.length > 100) {
      return { mimeType: "image/png", data: value };
    }
  }

  for (const value of Object.values(candidate)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findBase64Image(item);
        if (found) return found;
      }
    } else {
      const found = findBase64Image(value);
      if (found) return found;
    }
  }

  return null;
}

function hashToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) % 2147483647;
}

function extractNestedErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  const error = candidate.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  const topMessage = candidate.message;
  if (typeof topMessage === "string" && topMessage.trim()) return topMessage;
  return null;
}

function extractKlingTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data as Record<string, unknown> | undefined) || root;
  const taskId = data.task_id || data.taskId;
  return typeof taskId === "string" ? taskId : null;
}

function extractKlingTaskStatus(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const data = (root.data as Record<string, unknown> | undefined) || root;
  const status = data.task_status || data.taskStatus || root.status;
  return typeof status === "string" ? status.toLowerCase() : "";
}

function extractKlingTaskError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data as Record<string, unknown> | undefined) || root;
  const message = data.task_status_msg || root.message;
  return typeof message === "string" && message.trim() ? message : null;
}

function buildKlingQueryUrl(taskId: string): string {
  const template = process.env.KLING_QUERY_ENDPOINT_TEMPLATE;
  if (template?.includes("{task_id}")) {
    return template.replace("{task_id}", taskId);
  }

  const base = process.env.KLING_BASE_URL || "https://api-singapore.klingai.com";
  return `${base}/v1/images/generations/${taskId}`;
}

async function generateWithGemini(
  prompt: string,
  refs: string[]
): Promise<{ ok: true; imageSrc: string; modelUsed: string } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const fallbackModel = process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-3-pro-image-preview";
  const timeoutMs = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || 20000);

  if (!apiKey) {
    return { ok: false, error: "Missing GEMINI_API_KEY environment variable." };
  }

  const models = Array.from(new Set([primaryModel, fallbackModel]));
  let lastError = "Gemini image generation failed.";

  for (const model of models) {
    const referenceParts = refs
      .map((ref) => parseDataUrlImage(ref))
      .filter((item): item is { mimeType: string; data: string } => Boolean(item))
      .map((item) => ({ inlineData: { mimeType: item.mimeType, data: item.data } }));

    try {
      const response = await fetchJsonWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }, ...referenceParts] }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: {
                aspectRatio: "16:9",
              },
            },
          }),
        },
        timeoutMs
      );

      if (!response.ok) {
        const message =
          (response.data &&
            typeof response.data === "object" &&
            (response.data as { error?: { message?: string } }).error?.message) ||
          "Gemini image generation failed.";
        lastError = `${lastError} [${model}] ${message}`;
        continue;
      }

      const inline = findInlineImageData(response.data);
      if (inline) {
        return { ok: true, imageSrc: `data:${inline.mimeType};base64,${inline.data}`, modelUsed: model };
      }

      lastError = `${lastError} [${model}] No image returned by Gemini model ${model}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini image generation failed.";
      lastError = `${lastError} [${model}] ${message}`;
    }
  }

  return { ok: false, error: lastError };
}

async function createKlingTask(
  prompt: string,
  payload: z.infer<typeof generateImageSchema>
): Promise<
  | { ok: true; imageSrc: string; modelUsed: string }
  | { ok: true; taskId: string; modelUsed: string; status: KlingTaskStatus }
  | { ok: false; error: string }
> {
  const apiKey = process.env.KLING_API_KEY;
  const endpoint = process.env.KLING_IMAGE_ENDPOINT || "https://api-singapore.klingai.com/v1/images/omni-image";
  const model = process.env.KLING_IMAGE_MODEL || "kling-v2-1";
  const authHeader = process.env.KLING_AUTH_HEADER || "Authorization";
  const authPrefix = process.env.KLING_AUTH_PREFIX || "Bearer";
  const timeoutMs = Number(process.env.KLING_HTTP_TIMEOUT_MS || 15000);
  if (!apiKey) {
    return { ok: false, error: "Missing KLING_API_KEY environment variable." };
  }
  if (!endpoint) {
    return { ok: false, error: "Missing KLING_IMAGE_ENDPOINT environment variable." };
  }

  const seed = hashToSeed(`${payload.continuitySeed || "seed"}|${payload.sceneNumber}`);
  const referenceUrls = (payload.masterReferenceImages || []).filter((item) => /^https?:\/\//i.test(item));

  const response = await fetchJsonWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [authHeader]: `${authPrefix} ${apiKey}`,
      },
      body: JSON.stringify({
        model_name: model,
        prompt,
        negative_prompt: "",
        image_list: referenceUrls.slice(0, 4).map((image) => ({ image })),
        n: 1,
        aspect_ratio: "16:9",
        external_task_id: `scene_${payload.sceneNumber}_${seed}`,
        callback_url: "",
      }),
    },
    timeoutMs
  );

  const data = response.data;
  if (!response.ok) {
    const message = extractNestedErrorMessage(data) || "Kling image generation failed.";
    return { ok: false, error: message };
  }

  const immediateBase64 = findBase64Image(data);
  if (immediateBase64) {
    return { ok: true, imageSrc: `data:${immediateBase64.mimeType};base64,${immediateBase64.data}`, modelUsed: model };
  }

  const immediateUrl = findStringImageUrl(data);
  if (immediateUrl) {
    return { ok: true, imageSrc: immediateUrl, modelUsed: model };
  }

  const taskId = extractKlingTaskId(data);
  if (!taskId) {
    return { ok: false, error: "Kling create task succeeded but no task_id returned." };
  }

  return { ok: true, taskId, modelUsed: model, status: "submitted" };
}

async function queryKlingTask(
  taskId: string
): Promise<
  | { ok: true; status: "processing"; modelUsed: string }
  | { ok: true; status: "succeeded"; imageSrc: string; modelUsed: string }
  | { ok: false; error: string; status?: "failed" }
> {
  const apiKey = process.env.KLING_API_KEY;
  const authHeader = process.env.KLING_AUTH_HEADER || "Authorization";
  const authPrefix = process.env.KLING_AUTH_PREFIX || "Bearer";
  const model = process.env.KLING_IMAGE_MODEL || "kling-v2-1";
  const timeoutMs = Number(process.env.KLING_HTTP_TIMEOUT_MS || 15000);

  if (!apiKey) {
    return { ok: false, error: "Missing KLING_API_KEY environment variable." };
  }

  const queryUrl = buildKlingQueryUrl(taskId);
  const taskResponse = await fetchJsonWithTimeout(
    queryUrl,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        [authHeader]: `${authPrefix} ${apiKey}`,
      },
    },
    timeoutMs
  );

  const taskData = taskResponse.data;
  if (!taskResponse.ok) {
    const message = extractNestedErrorMessage(taskData) || "Kling task query failed.";
    return { ok: false, error: message };
  }

  const directResultUrl = extractKlingResultUrl(taskData);
  if (directResultUrl) {
    return { ok: true, status: "succeeded", imageSrc: directResultUrl, modelUsed: model };
  }

  const polledBase64 = findBase64Image(taskData);
  if (polledBase64) {
    return {
      ok: true,
      status: "succeeded",
      imageSrc: `data:${polledBase64.mimeType};base64,${polledBase64.data}`,
      modelUsed: model,
    };
  }

  const polledUrl = findStringImageUrl(taskData);
  if (polledUrl) {
    return { ok: true, status: "succeeded", imageSrc: polledUrl, modelUsed: model };
  }

  const status = extractKlingTaskStatus(taskData);
  if (status.includes("fail") || status.includes("error")) {
    return { ok: false, error: extractKlingTaskError(taskData) || `Kling task failed with status: ${status}`, status: "failed" };
  }

  return { ok: true, status: "processing", modelUsed: model };
}

function getProvider(): Provider {
  const provider = (process.env.IMAGE_PROVIDER || "gemini").toLowerCase();
  return provider === "kling" ? "kling" : "gemini";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = generateImageSchema.parse(body);

    const prompt = buildLockedImagePrompt(payload);
    const provider = getProvider();
    const refs = payload.masterReferenceImages || [];

    const primary = provider === "kling" ? await createKlingTask(prompt, payload) : await generateWithGemini(prompt, refs);

    if (primary.ok) {
      if ("taskId" in primary) {
        return NextResponse.json({
          provider,
          modelUsed: primary.modelUsed,
          taskId: primary.taskId,
          status: primary.status,
        });
      }
      return NextResponse.json({ imageDataUrl: primary.imageSrc, modelUsed: primary.modelUsed, provider });
    }

    const fallbackProvider = (process.env.IMAGE_FALLBACK_PROVIDER || "").toLowerCase();
    if (fallbackProvider === "gemini" && provider === "kling") {
      const fallback = await generateWithGemini(prompt, refs);
      if (fallback.ok) {
        return NextResponse.json({
          imageDataUrl: fallback.imageSrc,
          modelUsed: fallback.modelUsed,
          provider: "gemini",
          fallbackFrom: "kling",
        });
      }
      return NextResponse.json(
        { error: `Kling failed: ${primary.error} | Gemini fallback failed: ${fallback.error}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: primary.error }, { status: 502 });
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId")?.trim() || "";

    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId." }, { status: 400 });
    }

    const result = await queryKlingTask(taskId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, status: result.status || "failed" }, { status: 502 });
    }

    if (result.status === "processing") {
      return NextResponse.json({ status: "processing", modelUsed: result.modelUsed, provider: "kling" });
    }

    return NextResponse.json({
      status: "succeeded",
      imageDataUrl: result.imageSrc,
      modelUsed: result.modelUsed,
      provider: "kling",
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Unexpected image status error." }, { status: 500 });
  }
}
