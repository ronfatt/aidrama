import { NextResponse } from "next/server";
import { z } from "zod";
import { FANTASY_LOCATION_VOCABULARY, TAWAU_LOCATION_VOCABULARY } from "@/lib/constants";
import { buildStructuredVideoPrompt, pickKlingMotionTemplate } from "@/lib/kling-motion";
import { getCompanionModelName, getOpenAIClient } from "@/lib/openai";
import type { DirectorSceneType, FantasyBibleInput, FilmTone, ProjectMode, SceneItem, SceneMetadata } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const promptRequestSchema = z.object({
  settings: z.object({
    projectMode: z.union([z.literal("singapore-realism"), z.literal("tawau-sabah-realism"), z.literal("coastal-fantasy-drama")]).optional(),
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
      sceneType: z.union([z.literal("action"), z.literal("dialogue"), z.literal("environment"), z.literal("emotional")]).optional(),
      shotType: z.string().trim().min(1),
      shotGrammarPreset: z.string().trim().min(1).optional(),
      cameraStyle: z.string().trim().min(1).optional(),
      actionStyle: z.string().trim().min(1).optional(),
      motionTemplateId: z.string().trim().min(1).optional(),
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
      voiceScript: z.string().optional(),
      lipSyncPrompt: z.string().optional(),
      microActingPrompt: z.string().optional(),
      reactionShotPrompt: z.string().optional(),
    })
  ),
});

function buildPromptsJsonSchema(sceneCount: number) {
  return {
    name: "scene_prompts",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scenes: {
          type: "array",
          minItems: sceneCount,
          maxItems: sceneCount,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              sceneNumber: { type: "integer" },
              imagePrompt: { type: "string" },
              videoPrompt: { type: "string" },
              voiceScript: { type: "string" },
              lipSyncPrompt: { type: "string" },
              microActingPrompt: { type: "string" },
              reactionShotPrompt: { type: "string" },
            },
            required: [
              "sceneNumber",
              "imagePrompt",
              "videoPrompt",
              "voiceScript",
              "lipSyncPrompt",
              "microActingPrompt",
              "reactionShotPrompt",
            ],
          },
        },
      },
      required: ["scenes"],
    },
  } as const;
}

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
      : projectMode === "tawau-sabah-realism"
        ? `
- Keep all scenes in Tawau, Sabah realism with grounded civic and coastal-town textures.
- Preserve cinematic documentary realism over fantasy spectacle.
- Use municipal offices, public counters, shoplots, kampung air walkways, roadsides, jetties, wet markets, schools, clinics, local depots, and neighborhood housing where relevant.
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

Preferred location vocabulary:
${FANTASY_LOCATION_VOCABULARY.map((location) => `- ${location}`).join("\n")}
`
      : projectMode === "tawau-sabah-realism"
        ? `
Preferred location vocabulary:
${TAWAU_LOCATION_VOCABULARY.map((location) => `- ${location}`).join("\n")}
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
- Respect sceneType as a director-level instruction.
- Respect shotGrammarPreset as a concrete visual-template instruction.
- Respect cameraStyle and actionStyle as hard motion constraints.
- Respect motionTemplate as the preferred Kling motion baseline.
- Do not turn all scenes into front-facing portraits.
- Preserve shot diversity.
- If useReferenceImage=true, avoid re-describing facial identity.
- imagePrompt should describe the single best frame.
- videoPrompt must be written as five compact parts in this order: Scene, Subject, Action Timeline, Camera Movement, Atmosphere.
- In Action Timeline, prefer a short progression such as "first..., then..., finally...".
- Include camera movement explicitly rather than generic motion language.
- If sceneType is dialogue, also return:
  - voiceScript: a tight spoken line or spoken beat direction for the scene
  - lipSyncPrompt: concise prompt for lip-sync delivery
  - microActingPrompt: subtle head nods, breath, eyes, pauses, hand gestures
  - reactionShotPrompt: one cutaway or listener reaction idea
- If sceneType is not dialogue, return empty strings for those four dialogue fields.
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
      `${scene.sceneNumber}. [${scene.phase}] shotType=${scene.shotType} shotGrammarPreset="${scene.shotGrammarPreset || ""}" cameraStyle="${scene.cameraStyle || ""}" actionStyle="${scene.actionStyle || ""}" motionTemplate="${scene.motionTemplateId || ""}" importance=${scene.importance} ref=${scene.useReferenceImage ? "yes" : "no"} vo="${scene.voLine}" purpose="${scene.scenePurpose}" camera="${scene.camera}" lighting="${scene.lightingColor}"`
  )
  .join("\n")}
`;
}

function fallbackDialoguePack(scene: SceneMetadata) {
  const voiceScript = scene.voLine.trim();
  return {
    voiceScript,
    lipSyncPrompt: `${scene.cameraStyle || "cinematic close-up"}, character speaking naturally, synced to dialogue, restrained mouth movement, no exaggerated performance`,
    microActingPrompt:
      "subtle head nods, natural blinking, controlled breathing, tiny eye focus shifts, slight hand gesture, realistic pauses",
    reactionShotPrompt:
      "reaction shot of listener or nearby witness, brief cutaway with restrained concern, then return to speaker",
  };
}

async function generatePromptBatch(
  client: ReturnType<typeof getOpenAIClient>,
  parsed: z.infer<typeof promptRequestSchema>,
  scenes: z.infer<typeof promptRequestSchema>["scenes"]
) {
  const strictMode = parsed.settings.strictMode ?? true;
  const response = await client.responses.create({
    model: getCompanionModelName(),
    temperature: strictMode ? 0.18 : 0.45,
    max_output_tokens: Math.min(3000, 500 + scenes.length * 280),
    input: [
      {
        role: "user",
        content: buildPromptExpansionPrompt({
          ...parsed,
          scenes,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        ...buildPromptsJsonSchema(scenes.length),
      },
    },
  });

  const raw = response.output_text;
  if (!raw) {
    throw new Error("No scene prompts returned from model.");
  }

  try {
    return promptResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Scene prompt model response was malformed JSON.");
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = promptRequestSchema.parse(body);
    const client = getOpenAIClient();
    let firstPass;
    try {
      firstPass = await generatePromptBatch(client, parsed, parsed.scenes);
    } catch (error) {
      if (error instanceof Error && error.message === "Scene prompt model response was malformed JSON.") {
        firstPass = await generatePromptBatch(client, parsed, parsed.scenes);
      } else {
        throw error;
      }
    }
    const byScene = new Map(firstPass.scenes.map((scene) => [scene.sceneNumber, scene]));
    const missingScenes = parsed.scenes.filter((scene) => !byScene.has(scene.sceneNumber));

    if (missingScenes.length > 0) {
      let retryPass;
      try {
        retryPass = await generatePromptBatch(client, parsed, missingScenes);
      } catch (error) {
        if (error instanceof Error && error.message === "Scene prompt model response was malformed JSON.") {
          retryPass = await generatePromptBatch(client, parsed, missingScenes);
        } else {
          throw error;
        }
      }
      for (const scene of retryPass.scenes) {
        byScene.set(scene.sceneNumber, scene);
      }
    }

    const stillMissing = parsed.scenes.filter((scene) => !byScene.has(scene.sceneNumber));
    if (stillMissing.length > 0) {
      throw new Error(
        `Prompt generation returned incomplete scene coverage. Missing scene numbers: ${stillMissing
          .map((scene) => scene.sceneNumber)
          .join(", ")}.`
      );
    }

    const scenes: SceneItem[] = (parsed.scenes as SceneMetadata[]).map((scene) => {
      const motionTemplate = pickKlingMotionTemplate({
        scene,
        projectMode: (parsed.settings.projectMode || "singapore-realism") as ProjectMode,
        style: parsed.settings.style as FilmTone,
      });
      const prompts = byScene.get(scene.sceneNumber)!;
      const rawVideoPrompt = prompts.videoPrompt.trim();
      const dialoguePack =
        (scene.sceneType as DirectorSceneType | undefined) === "dialogue"
          ? {
              voiceScript: prompts.voiceScript?.trim() || fallbackDialoguePack(scene).voiceScript,
              lipSyncPrompt: prompts.lipSyncPrompt?.trim() || fallbackDialoguePack(scene).lipSyncPrompt,
              microActingPrompt: prompts.microActingPrompt?.trim() || fallbackDialoguePack(scene).microActingPrompt,
              reactionShotPrompt: prompts.reactionShotPrompt?.trim() || fallbackDialoguePack(scene).reactionShotPrompt,
            }
          : {
              voiceScript: "",
              lipSyncPrompt: "",
              microActingPrompt: "",
              reactionShotPrompt: "",
            };
      return {
        ...scene,
        cameraStyle: scene.cameraStyle || motionTemplate.cameraStyle,
        actionStyle: scene.actionStyle || motionTemplate.actionStyle,
        motionTemplateId: scene.motionTemplateId || motionTemplate.id,
        imagePrompt: prompts.imagePrompt,
        videoPrompt:
          /^scene:\s/i.test(rawVideoPrompt)
            ? rawVideoPrompt
            : buildStructuredVideoPrompt({
                basePrompt: rawVideoPrompt,
                scenePurpose: scene.scenePurpose,
                cameraMovement: `${scene.cameraStyle || motionTemplate.cameraStyle}, ${scene.camera}`,
                atmosphere: `${scene.lightingColor}, ${scene.actionStyle || motionTemplate.actionStyle}`,
              }),
        ...dialoguePack,
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
