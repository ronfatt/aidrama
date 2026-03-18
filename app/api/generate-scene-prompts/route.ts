import { NextResponse } from "next/server";
import { z } from "zod";
import { FANTASY_LOCATION_VOCABULARY, TAWAU_LOCATION_VOCABULARY } from "@/lib/constants";
import { buildStructuredVideoPrompt, pickKlingMotionTemplate } from "@/lib/kling-motion";
import { getCompanionModelName, getOpenAIClient } from "@/lib/openai";
import type { CastMemberInput, DirectorSceneType, FantasyBibleInput, FilmTone, ProjectMode, SceneItem, SceneMetadata } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const promptRequestSchema = z.object({
  settings: z.object({
    projectMode: z.union([z.literal("singapore-realism"), z.literal("tawau-sabah-realism"), z.literal("coastal-fantasy-drama")]).optional(),
    title: z.string().optional(),
    style: z.string().min(1),
    aspectRatio: z.union([z.literal("16:9"), z.literal("9:16")]).optional(),
    colorGradePreset: z.string().optional(),
    narratorCharacter: z.string().optional(),
    onScreenCharacter: z.string().optional(),
    referenceTag: z.string().optional(),
    castBible: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          role: z.string().min(1),
          referenceTag: z.string().optional().or(z.literal("")),
          identityNote: z.string().optional().or(z.literal("")),
          wardrobeNote: z.string().optional().or(z.literal("")),
          hasOfficialRef: z.boolean().optional(),
        })
      )
      .max(8)
      .optional(),
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
      onScreenCharacter: z.string().optional().or(z.literal("")),
      impliedOtherCharacter: z.string().optional().or(z.literal("")),
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
      actionSequence: z.string().optional(),
      impactBeat: z.string().optional(),
      enemyResponse: z.string().optional(),
      aftermathShot: z.string().optional(),
      establishingBeat: z.string().optional(),
      cutawayPrompt: z.string().optional(),
      atmosphereNote: z.string().optional(),
      transitionBeat: z.string().optional(),
      microTensionPrompt: z.string().optional(),
      silenceBeat: z.string().optional(),
      eyeLineShiftPrompt: z.string().optional(),
      pullAwayShot: z.string().optional(),
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
              actionSequence: { type: "string" },
              impactBeat: { type: "string" },
              enemyResponse: { type: "string" },
              aftermathShot: { type: "string" },
              establishingBeat: { type: "string" },
              cutawayPrompt: { type: "string" },
              atmosphereNote: { type: "string" },
              transitionBeat: { type: "string" },
              microTensionPrompt: { type: "string" },
              silenceBeat: { type: "string" },
              eyeLineShiftPrompt: { type: "string" },
              pullAwayShot: { type: "string" },
            },
            required: [
              "sceneNumber",
              "imagePrompt",
              "videoPrompt",
              "voiceScript",
              "lipSyncPrompt",
              "microActingPrompt",
              "reactionShotPrompt",
              "actionSequence",
              "impactBeat",
              "enemyResponse",
              "aftermathShot",
              "establishingBeat",
              "cutawayPrompt",
              "atmosphereNote",
              "transitionBeat",
              "microTensionPrompt",
              "silenceBeat",
              "eyeLineShiftPrompt",
              "pullAwayShot",
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
- Use modern municipal offices, clean public counters, refreshed shoplots, maintained kampung air walkways, upgraded roadsides, jetties, wet markets, schools, clinics, local depots, and neighborhood housing where relevant.
- Favor contemporary, cleaner, more maintained architecture and infrastructure.
- Avoid prompts that imply retro, abandoned, decaying, shabby, or very old building stock unless the scene metadata explicitly requires damage.
- Keep the color treatment contemporary: crisp daylight, controlled tropical humidity, clean practicals, realistic modern municipal contrast, no vintage sepia wash.
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
  const castBible = input.settings.castBible as Array<
    Pick<CastMemberInput, "name" | "role" | "referenceTag" | "identityNote" | "wardrobeNote"> & { hasOfficialRef?: boolean }
  > | undefined;
  const castBibleBlock = castBible?.length
    ? `
Cast bible:
${castBible
  .map(
    (character) =>
      `- ${character.name} | role=${character.role} | referenceTag=${character.referenceTag || "(none)"} | identity=${character.identityNote || "(none)"} | wardrobe=${character.wardrobeNote || "(none)"} | officialRef=${character.hasOfficialRef ? "yes" : "no"}`
  )
  .join("\n")}
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
- frame ratio: ${input.settings.aspectRatio || "16:9"}
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
- Compose for ${input.settings.aspectRatio === "9:16" ? "9:16 vertical framing with stronger height and stacked composition" : "16:9 widescreen framing with horizontal environmental depth"}.
- If a scene implies another important character, do not make both characters equally clear in the same frame.
- If onScreenCharacter is provided, treat that character as the single clear visible subject for this scene.
- If impliedOtherCharacter is provided, keep that character implied through over-shoulder, silhouette, back view, reflection, foreground blur, hands, or cutaway presence.
- Prefer relationship-safe cinematic coverage:
  - one clear speaker close-up
  - one listener reaction shot
  - one over-shoulder witness angle
  - one back-view or silhouette tension frame
  - one hands / object / doorway / environment cutaway between character beats
- Avoid two clear frontal faces in one frame unless the scene metadata explicitly makes that unavoidable, and even then keep one face partial or less dominant.
- videoPrompt must be written as five compact parts in this order: Scene, Subject, Action Timeline, Camera Movement, Atmosphere.
- In Action Timeline, prefer a short progression such as "first..., then..., finally...".
- Include camera movement explicitly rather than generic motion language.
- If sceneType is dialogue, also return:
  - voiceScript: a tight spoken line or spoken beat direction for the scene
  - lipSyncPrompt: concise prompt for lip-sync delivery
  - microActingPrompt: subtle head nods, breath, eyes, pauses, hand gestures
  - reactionShotPrompt: one cutaway or listener reaction idea
- If sceneType is action, also return:
  - actionSequence: concise beat-by-beat action progression
  - impactBeat: the main impact or turning hit
  - enemyResponse: how the enemy or opposing force responds
  - aftermathShot: the immediate visual aftermath or reset beat
- If sceneType is environment, also return:
  - establishingBeat: what the opening environmental read should communicate
  - cutawayPrompt: one insert or cutaway idea that supports the space
  - atmosphereNote: ambient texture, movement, weather, or social activity note
  - transitionBeat: how this location can bridge into or out of nearby scenes
- If sceneType is emotional, also return:
  - microTensionPrompt: subtle physical tension or restraint direction
  - silenceBeat: the held emotional pause inside the moment
  - eyeLineShiftPrompt: eye focus or glance change that reveals inner thought
  - pullAwayShot: the ideal retreating or widening shot after the emotion lands
- If sceneType is not dialogue, return empty strings for the four dialogue fields.
- If sceneType is not action, return empty strings for the four action fields.
- If sceneType is not environment, return empty strings for the four environment fields.
- If sceneType is not emotional, return empty strings for the four emotional fields.
- style: ${input.settings.style}
- color grade preset: ${input.settings.colorGradePreset || "(not provided)"}
- narrator / POV character: ${input.settings.narratorCharacter?.trim() || "(not provided)"}
- primary on-screen character: ${input.settings.onScreenCharacter?.trim() || "(not provided)"}
- reference tag: ${input.settings.referenceTag?.trim() || "(not provided)"}
- strict mode: ${input.settings.strictMode === false ? "OFF" : "ON"}
- title: ${input.settings.title?.trim() || "(not provided)"}
${modeRules}
${fantasyBibleBlock}
${castBibleBlock}

Scenes:
${input.scenes
  .map(
    (scene) =>
      `${scene.sceneNumber}. [${scene.phase}] onScreen="${scene.onScreenCharacter || ""}" impliedOther="${scene.impliedOtherCharacter || ""}" shotType=${scene.shotType} shotGrammarPreset="${scene.shotGrammarPreset || ""}" cameraStyle="${scene.cameraStyle || ""}" actionStyle="${scene.actionStyle || ""}" motionTemplate="${scene.motionTemplateId || ""}" importance=${scene.importance} ref=${scene.useReferenceImage ? "yes" : "no"} vo="${scene.voLine}" purpose="${scene.scenePurpose}" camera="${scene.camera}" lighting="${scene.lightingColor}"`
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
      "reaction shot of listener or nearby witness, preferably as single-subject close-up, over-shoulder, or partial-profile response before returning to speaker",
  };
}

function fallbackActionPack() {
  return {
    actionSequence: "first tension builds, then the hero commits to the move, finally the impact resolves into a brief reset beat",
    impactBeat: "main impact lands with controlled force, motion blur, and environmental reaction",
    enemyResponse: "opposing force recoils, counters, or pressures back within the same beat",
    aftermathShot: "brief aftermath frame showing debris, breath, recoil, or charged stillness before the next move",
  };
}

function fallbackEnvironmentPack(scene: SceneMetadata) {
  return {
    establishingBeat: `establish the surrounding space as ${scene.scenePurpose.toLowerCase()}`,
    cutawayPrompt: "insert cutaway of location detail, signage, hands, doorway separation, or environmental movement that reinforces place and can bridge between two character beats",
    atmosphereNote: `${scene.lightingColor}, ambient environmental activity, subtle lived-in motion`,
    transitionBeat: "use the location beat to bridge into the next action or emotional turn with a calm spatial handoff",
  };
}

function fallbackEmotionalPack(scene: SceneMetadata) {
  return {
    microTensionPrompt: "controlled breathing, restrained posture, tiny jaw or hand tension, emotion held just beneath the surface",
    silenceBeat: `hold on a quiet pause after "${scene.voLine}" so the feeling lands before the next beat`,
    eyeLineShiftPrompt: "small eye-line change away from camera or toward negative space to suggest internal processing",
    pullAwayShot: "after the emotion lands, slowly pull away or widen to leave the character in reflective space",
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
      const isDialogue = (scene.sceneType as DirectorSceneType | undefined) === "dialogue";
      const isAction = (scene.sceneType as DirectorSceneType | undefined) === "action";
      const isEnvironment = (scene.sceneType as DirectorSceneType | undefined) === "environment";
      const isEmotional = (scene.sceneType as DirectorSceneType | undefined) === "emotional";
      const dialoguePack =
        isDialogue
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
      const actionPack = isAction
        ? {
            actionSequence: prompts.actionSequence?.trim() || fallbackActionPack().actionSequence,
            impactBeat: prompts.impactBeat?.trim() || fallbackActionPack().impactBeat,
            enemyResponse: prompts.enemyResponse?.trim() || fallbackActionPack().enemyResponse,
            aftermathShot: prompts.aftermathShot?.trim() || fallbackActionPack().aftermathShot,
          }
        : {
            actionSequence: "",
            impactBeat: "",
            enemyResponse: "",
            aftermathShot: "",
          };
      const environmentPack = isEnvironment
        ? {
            establishingBeat: prompts.establishingBeat?.trim() || fallbackEnvironmentPack(scene).establishingBeat,
            cutawayPrompt: prompts.cutawayPrompt?.trim() || fallbackEnvironmentPack(scene).cutawayPrompt,
            atmosphereNote: prompts.atmosphereNote?.trim() || fallbackEnvironmentPack(scene).atmosphereNote,
            transitionBeat: prompts.transitionBeat?.trim() || fallbackEnvironmentPack(scene).transitionBeat,
          }
        : {
            establishingBeat: "",
            cutawayPrompt: "",
            atmosphereNote: "",
            transitionBeat: "",
          };
      const emotionalPack = isEmotional
        ? {
            microTensionPrompt: prompts.microTensionPrompt?.trim() || fallbackEmotionalPack(scene).microTensionPrompt,
            silenceBeat: prompts.silenceBeat?.trim() || fallbackEmotionalPack(scene).silenceBeat,
            eyeLineShiftPrompt: prompts.eyeLineShiftPrompt?.trim() || fallbackEmotionalPack(scene).eyeLineShiftPrompt,
            pullAwayShot: prompts.pullAwayShot?.trim() || fallbackEmotionalPack(scene).pullAwayShot,
          }
        : {
            microTensionPrompt: "",
            silenceBeat: "",
            eyeLineShiftPrompt: "",
            pullAwayShot: "",
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
        ...actionPack,
        ...environmentPack,
        ...emotionalPack,
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
