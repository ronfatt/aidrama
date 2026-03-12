import { NextResponse } from "next/server";
import { z } from "zod";
import { getCompanionModelName, getOpenAIClient } from "@/lib/openai";
import type { FantasyBibleInput, ProjectMode, SceneItem, SceneMetadata } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const promptRequestSchema = z.object({
  settings: z.object({
    projectMode: z.union([z.literal("singapore-realism"), z.literal("coastal-fantasy-drama")]).optional(),
    title: z.string().optional(),
    style: z.string().min(1),
    colorGradePreset: z.string().optional(),
    narratorCharacter: z.string().optional(),
    onScreenCharacter: z.string().optional(),
    referenceTag: z.string().optional(),
    strictMode: z.boolean().optional(),
    fantasyBible: z
      .object({
        corePremise: z.string().optional(),
        heroName: z.string().optional(),
        powerType: z.string().optional(),
        powerLimits: z.string().optional(),
        enemyType: z.string().optional(),
        worldTone: z.string().optional(),
        endingHook: z.string().optional(),
      })
      .optional(),
  }),
  scenes: z.array(
    z.object({
      sceneNumber: z.number().int().positive(),
      phase: z.string().trim().min(1),
      voLine: z.string().trim().min(1),
      shotType: z.string().trim().min(1),
      scenePurpose: z.string().trim().min(1),
      importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
      useReferenceImage: z.boolean(),
      camera: z.string().trim().min(1),
      lightingColor: z.string().trim().min(1),
    })
  ).min(1).max(10),
});

const promptResponseSchema = z.object({
  scenes: z.array(
    z.object({
      sceneNumber: z.number().int().positive(),
      imagePrompt: z.string().min(1),
      videoPrompt: z.string().min(1),
    })
  ),
});

const promptsJsonSchema = {
  name: "scene_prompts",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sceneNumber: { type: "integer" },
            imagePrompt: { type: "string" },
            videoPrompt: { type: "string" },
          },
          required: ["sceneNumber", "imagePrompt", "videoPrompt"],
        },
      },
    },
    required: ["scenes"],
  },
} as const;

function buildPromptExpansionPrompt(input: z.infer<typeof promptRequestSchema>) {
  const projectMode = (input.settings.projectMode || "singapore-realism") as ProjectMode;
  const fantasyBible = input.settings.fantasyBible as FantasyBibleInput | undefined;
  const modeRules =
    projectMode === "coastal-fantasy-drama"
      ? `
- Treat this as coastal fantasy drama, not documentary-only realism.
- Keep the hero and world grounded in a modern Southeast Asian coastal city context.
- Use oceanic atmosphere, wet textures, reflections, salt-air haze, shoreline architecture, storm drains, breakwaters, harbours, rooftops facing sea wind, and controlled elemental motion where relevant.
- Show power emergence through water tension, droplets, mist, reflections, tides, spray, pressure, or aftermath rather than generic superhero spectacle.
- Enemies should usually be implied through silhouette, wake, reflection, shadow, damaged space, or threatening environmental movement unless the scene metadata clearly makes them the single visible subject.
- Mix intimate character frames with wide isolation, threshold compositions, back views, over-shoulder witness frames, reflection shots, object-detail inserts, and negative-space coastal frames.
`
      : `
- Keep all scenes in Singapore heartland reality with grounded local textures.
- Preserve cinematic documentary realism over fantasy spectacle.
- Use HDB, corridors, void decks, MRT, hawker centres, neighbourhood streets, parks, and small apartments where relevant.
`;
  const fantasyBibleBlock =
    projectMode === "coastal-fantasy-drama"
      ? `
Fantasy bible:
- core premise: ${fantasyBible?.corePremise?.trim() || "(not provided)"}
- hero name: ${fantasyBible?.heroName?.trim() || input.settings.onScreenCharacter?.trim() || "(not provided)"}
- power type: ${fantasyBible?.powerType?.trim() || "(not provided)"}
- power limits: ${fantasyBible?.powerLimits?.trim() || "(not provided)"}
- enemy type: ${fantasyBible?.enemyType?.trim() || "(not provided)"}
- world tone: ${fantasyBible?.worldTone?.trim() || "(not provided)"}
- ending hook: ${fantasyBible?.endingHook?.trim() || "(not provided)"}
`
      : "";
  return `
Generate concise cinematic image and video prompts for these scene metadata items.

Return valid JSON only:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "imagePrompt": "string",
      "videoPrompt": "string"
    }
  ]
}

Rules:
- Keep prompts practical for still-image generation and image-to-video.
- project mode: ${projectMode}
- Only one clearly visible character per scene.
- Respect shotType, scenePurpose, camera, and lightingColor exactly.
- Do not turn all scenes into front-facing portraits.
- Preserve shot diversity.
- If useReferenceImage=true, avoid re-describing facial identity.
- imagePrompt should describe the single best frame.
- videoPrompt should describe subtle motion, environmental motion, and camera movement.
- style: ${input.settings.style}
- color grade preset: ${input.settings.colorGradePreset || "(not provided)"}
- narrator / POV character: ${input.settings.narratorCharacter?.trim() || "(not provided)"}
- primary on-screen character: ${input.settings.onScreenCharacter?.trim() || "(not provided)"}
- reference tag: ${input.settings.referenceTag?.trim() || "(not provided)"}
- strict mode: ${input.settings.strictMode === false ? "OFF" : "ON"}
- title: ${input.settings.title?.trim() || "(not provided)"}
${modeRules}
${fantasyBibleBlock}

Scenes:
${input.scenes
  .map(
    (scene) =>
      `${scene.sceneNumber}. [${scene.phase}] shotType=${scene.shotType} importance=${scene.importance} ref=${scene.useReferenceImage ? "yes" : "no"} vo="${scene.voLine}" purpose="${scene.scenePurpose}" camera="${scene.camera}" lighting="${scene.lightingColor}"`
  )
  .join("\n")}
`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = promptRequestSchema.parse(body);
    const client = getOpenAIClient();
    const strictMode = parsed.settings.strictMode ?? true;

    const response = await client.responses.create({
      model: getCompanionModelName(),
      temperature: strictMode ? 0.18 : 0.45,
      max_output_tokens: 3000,
      input: [{ role: "user", content: buildPromptExpansionPrompt(parsed) }],
      text: {
        format: {
          type: "json_schema",
          ...promptsJsonSchema,
        },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      throw new Error("No scene prompts returned from model.");
    }

    const promptPayload = promptResponseSchema.parse(JSON.parse(raw));
    const byScene = new Map(promptPayload.scenes.map((scene) => [scene.sceneNumber, scene]));
    const scenes: SceneItem[] = (parsed.scenes as SceneMetadata[]).map((scene) => {
      const prompts = byScene.get(scene.sceneNumber);
      if (!prompts) {
        throw new Error(`Missing prompts for scene ${scene.sceneNumber}.`);
      }

      return {
        ...scene,
        imagePrompt: prompts.imagePrompt,
        videoPrompt: prompts.videoPrompt,
      };
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid scene prompt request or output format." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unexpected scene prompt error." }, { status: 500 });
  }
}
