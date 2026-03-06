import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { enforceFilmPackGuardrails } from "@/lib/output-guardrails";
import { filmPackJsonSchema } from "@/lib/prompts/outputSchema";
import { buildPrompt } from "@/lib/prompts/promptBuilder";
import { filmPackSchema, generateRequestSchema } from "@/lib/schemas";
import { getModelName, getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = generateRequestSchema.parse(body);
    const strictMode = parsedBody.settings.strictMode ?? parsedBody.strict_mode ?? true;

    const client = getOpenAIClient();

    const response = await client.responses.create({
      model: getModelName(),
      temperature: strictMode ? 0.18 : 0.55,
      input: [
        {
          role: "user",
          content: buildPrompt(parsedBody.settings.originalScript, {
            title: parsedBody.settings.title,
            referenceTag: parsedBody.settings.referenceTag,
            sceneCount: parsedBody.settings.sceneCount,
            style: parsedBody.settings.style,
            strictMode,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...filmPackJsonSchema,
        },
      },
    });

    const raw = response.output_text;

    if (!raw) {
      return NextResponse.json({ error: "No content returned from model." }, { status: 502 });
    }

    const candidate = JSON.parse(raw);
    const parsedFilmPack = filmPackSchema.parse(candidate);
    const filmPack = enforceFilmPackGuardrails(parsedFilmPack, { strictMode });

    if (filmPack.scenes.length !== parsedBody.settings.sceneCount) {
      return NextResponse.json(
        {
          error: `Model returned ${filmPack.scenes.length} scenes; expected ${parsedBody.settings.sceneCount}. Please retry.`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ filmPack });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request or output format.", details: error.flatten() },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
