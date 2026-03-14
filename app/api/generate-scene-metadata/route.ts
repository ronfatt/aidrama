import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeBeatSheet } from "@/lib/beat-sheet";
import { FANTASY_LOCATION_VOCABULARY, TAWAU_LOCATION_VOCABULARY } from "@/lib/constants";
import { pickKlingMotionTemplate } from "@/lib/kling-motion";
import { getFilmPackModelName, getOpenAIClient } from "@/lib/openai";
import { generateRequestSchema } from "@/lib/schemas";
import type { BeatItem, DirectorSceneType, FantasyBibleInput, ProjectMode, SceneMetadata } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const metadataSchema = z.object({
  scenes: z.array(
    z.object({
      sceneNumber: z.number().int().positive(),
      phase: z.string().trim().min(1),
      voLine: z.string().trim().min(1),
      sceneType: z.union([z.literal("action"), z.literal("dialogue"), z.literal("environment"), z.literal("emotional")]).optional(),
      shotType: z.string().trim().min(1),
      shotGrammarPreset: z.string().trim().min(1),
      cameraStyle: z.string().trim().min(1).optional(),
      actionStyle: z.string().trim().min(1).optional(),
      motionTemplateId: z.string().trim().min(1).optional(),
      scenePurpose: z.string().trim().min(1),
      importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
      useReferenceImage: z.boolean(),
      camera: z.string().trim().min(1),
      lightingColor: z.string().trim().min(1),
    })
  ),
});

function buildMetadataJsonSchema(sceneCount: number) {
  return {
    name: "scene_metadata",
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
              phase: { type: "string" },
              voLine: { type: "string" },
              sceneType: { type: "string", enum: ["action", "dialogue", "environment", "emotional"] },
              shotType: { type: "string" },
              shotGrammarPreset: { type: "string" },
              cameraStyle: { type: "string" },
              actionStyle: { type: "string" },
              motionTemplateId: { type: "string" },
              scenePurpose: { type: "string" },
              importance: { type: "string", enum: ["A", "B", "C"] },
              useReferenceImage: { type: "boolean" },
              camera: { type: "string" },
              lightingColor: { type: "string" },
            },
            required: [
              "sceneNumber",
              "phase",
              "voLine",
              "sceneType",
              "shotType",
              "shotGrammarPreset",
              "cameraStyle",
              "actionStyle",
              "motionTemplateId",
              "scenePurpose",
              "importance",
              "useReferenceImage",
              "camera",
              "lightingColor",
            ],
          },
        },
      },
      required: ["scenes"],
    },
  } as const;
}

function beatLine(beat: BeatItem) {
  return `${beat.beatNumber}. [${beat.phase}] storyArc="${beat.storyArc}" shotGrammarPreset="${beat.shotGrammarPreset}" role=${beat.role} importance=${beat.importance} visualRole="${beat.visualRole}" framingIntent="${beat.framingIntent}" vo="${beat.voLine}" purpose="${beat.purpose}"`;
}

function preserveOriginalBeatNumbers(rawBeats: BeatItem[], normalizedBeats: BeatItem[]) {
  return normalizedBeats.map((beat, index) => ({
    ...beat,
    beatNumber: rawBeats[index]?.beatNumber ?? beat.beatNumber,
  }));
}

function buildMetadataPrompt({
  beatSheet,
  title,
  style,
  colorGradePreset,
  projectMode,
  fantasyBible,
  narratorCharacter,
  onScreenCharacter,
  referenceTag,
  strictMode,
}: {
  beatSheet: BeatItem[];
  title?: string;
  style: string;
  colorGradePreset?: string;
  projectMode: ProjectMode;
  fantasyBible?: FantasyBibleInput;
  narratorCharacter?: string;
  onScreenCharacter?: string;
  referenceTag?: string;
  strictMode: boolean;
}) {
  const modeRules =
    projectMode === "coastal-fantasy-drama"
      ? `
- Build metadata for a coastal fantasy short drama with one hero and implied enemy pressure.
- Keep the world grounded but mythic: modern Southeast Asian coastal city edges, wet concrete, shoreline housing, jetties, breakwaters, sea walls, harbours, storm drains, and rooftops facing water.
- Let scenes move between ordinary life, first supernatural sign, power escalation, threat awareness, confrontation, and hook-ending fallout.
- Show enemies indirectly unless they are the single visible character in that scene.
- Use the fantasy bible as a hard constraint for hero identity, power language, enemy logic, and ending hook.
`
      : projectMode === "tawau-sabah-realism"
        ? `
- Keep metadata grounded in Tawau, Sabah realism.
- Use real Tawau and Sabah civic and neighborhood spaces: municipal offices, service counters, shoplots, roadsides, jetties, kampung air walkways, wet markets, schools, clinics, public works depots, and housing areas.
- Maintain local civic-documentary realism rather than fantasy spectacle.
`
        : `
- Keep metadata grounded in contemporary Singapore realism.
- Use real Singapore heartland spaces: HDB flats, corridors, void decks, MRT stations, hawker centres, neighbourhood streets, parks, and small apartments.
- Maintain documentary-emotional realism rather than fantasy spectacle.
`;
  const fantasyBibleBlock =
    projectMode === "coastal-fantasy-drama"
      ? `
Fantasy bible:
- core premise: ${fantasyBible?.corePremise?.trim() || "(not provided)"}
- hero name: ${fantasyBible?.heroName?.trim() || onScreenCharacter?.trim() || "(not provided)"}
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
Generate scene metadata only from this beat sheet.

Return valid JSON only:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "phase": "string",
      "voLine": "string",
      "shotType": "string",
      "shotGrammarPreset": "string",
      "scenePurpose": "string",
      "importance": "A | B | C",
      "useReferenceImage": true,
      "camera": "string",
      "lightingColor": "string"
    }
  ]
}

Rules:
- project mode: ${projectMode}
- Only one clearly visible character per scene.
- No new facts, events, places, or people.
- Use beat.visualRole and beat.framingIntent as hard composition instructions.
- Use beat.shotGrammarPreset as a hard visual-template instruction.
- Assign one sceneType from: action, dialogue, environment, emotional.
- dialogue means the scene should play as spoken performance, reaction, or conversational coverage.
- action means physical conflict, chase, power burst, impact, or kinetic escalation.
- environment means place-establishing, civic/world detail, travel, or atmospheric coverage.
- emotional means reflection, silence, inner conflict, grief, hesitation, or intimate character tension.
- Assign one cameraStyle and one actionStyle that fit Kling cinematic motion logic.
- cameraStyle should be a concise label such as handheld documentary, cinematic tracking, low-angle hero shot, slow orbit camera, or aerial drone shot.
- actionStyle should be a concise label such as subtle realism, device interaction, emotional focus, heroic action, ocean power surge, or reflective pause.
- Do not repeat the same portrait setup in consecutive scenes.
- At least 25 percent of scenes must avoid front-facing portrait framing.
- If no reference tag is provided, set useReferenceImage=false for all scenes.
- If narrator and on-screen character differ, prioritize the on-screen character visually.
- Keep metadata concise and practical.
- Do not leave shotGrammarPreset empty.
- style: ${style}
- color grade preset: ${colorGradePreset || "(not provided)"}
- narrator / POV character: ${narratorCharacter?.trim() || "(not provided)"}
- primary on-screen character: ${onScreenCharacter?.trim() || "(not provided)"}
- reference tag: ${referenceTag?.trim() || "(not provided)"}
- strict mode: ${strictMode ? "ON" : "OFF"}
- title: ${title?.trim() || "(not provided)"}
${modeRules}
${fantasyBibleBlock}

Beat sheet:
${beatSheet.map(beatLine).join("\n")}
`;
}

function parseMetadataPayload(raw: string) {
  try {
    return metadataSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Scene metadata model response was malformed JSON.");
    }
    throw error;
  }
}

function fallbackShotTypeFromBeat(beat: BeatItem): SceneMetadata["shotType"] {
  const grammar = beat.shotGrammarPreset.toLowerCase();
  const visualRole = beat.visualRole.toLowerCase();
  const framingIntent = beat.framingIntent.toLowerCase();

  if (beat.role === "transition") return "transition B-roll";
  if (beat.role === "broll") {
    if (grammar.includes("insert") || visualRole.includes("object")) return "symbolic insert";
    return "atmospheric insert";
  }
  if (framingIntent.includes("over-shoulder") || visualRole.includes("over-shoulder")) return "over-shoulder shot";
  if (framingIntent.includes("witness") && grammar.includes("frame")) return "behavior shot";
  if (framingIntent.includes("close") || visualRole.includes("portrait")) return "character close-up";
  if (framingIntent.includes("distance") || visualRole.includes("wide")) return "environment";
  if (framingIntent.includes("reflection") || grammar.includes("omen") || grammar.includes("silhouette")) {
    return "symbolic insert";
  }
  return "behavior shot";
}

function fallbackDirectorSceneTypeFromBeat(beat: BeatItem): DirectorSceneType {
  const text = `${beat.voLine} ${beat.purpose} ${beat.visualRole} ${beat.framingIntent} ${beat.shotGrammarPreset}`.toLowerCase();
  if (/say|speaking|speaks|asks|tells|warns|dialogue|conversation|listening|reply|reassure|promises/.test(text)) {
    return "dialogue";
  }
  if (/fight|combat|enemy|attack|threat|impact|power|surge|confrontation|pursuit|collision|hero/.test(text)) {
    return "action";
  }
  if (/environment|establish|world|location|village|office|harbour|market|jetty|corridor|atmospheric|travel/.test(text)) {
    return "environment";
  }
  return "emotional";
}

function fallbackCameraFromBeat(beat: BeatItem): string {
  const grammar = beat.shotGrammarPreset.toLowerCase();
  const framingIntent = beat.framingIntent.toLowerCase();
  if (beat.role === "transition") return "slow drifting transitional move";
  if (beat.role === "broll") return "measured observational glide";
  if (grammar.includes("power reveal")) return "subtle push-in as tension builds";
  if (grammar.includes("enemy reveal") || grammar.includes("threat")) return "slow creeping advance with held tension";
  if (framingIntent.includes("close")) return "controlled close push-in";
  if (framingIntent.includes("distance") || framingIntent.includes("wide")) return "slow wide hold with minimal drift";
  if (framingIntent.includes("over-shoulder")) return "steady over-shoulder hold";
  return "controlled cinematic hold";
}

function fallbackLightingFromBeat(beat: BeatItem, projectMode: ProjectMode, colorGradePreset?: string): string {
  if (projectMode === "coastal-fantasy-drama") {
    switch (colorGradePreset) {
      case "storm-blue mythic":
        return "storm-blue mythic grade, sea-cooled shadows, controlled highlight contrast";
      case "moonlit coastal tension":
        return "moonlit coastal tension, silver-blue reflections, wet shadow detail";
      case "sunset awakening":
        return "sunset awakening tones, ember-gold edge light, teal sea contrast";
      case "tidal supernatural realism":
        return "tidal supernatural realism, grounded marine neutrals, subtle water glow";
      default:
        return "oceanic fantasy realism, controlled cool shadows, practical highlights";
    }
  }

  if (projectMode === "tawau-sabah-realism") {
    return `Tawau / Sabah realism, grounded public-service and coastal-town textures, practical daylight and humid tropical atmosphere`;
  }

  switch (colorGradePreset) {
    case "neutral-cool restraint":
      return "neutral-cool restraint, soft cyan-gray shadows, muted practical warmth";
    case "muted realism":
      return "muted realism, softened saturation, gentle neutral contrast";
    case "soft warm intimacy":
      return "soft warm intimacy, amber practical light, gentle warm-neutral shadows";
    case "warm-neutral documentary":
    default:
      return "warm-neutral documentary light, natural practical warmth, grounded contrast";
  }
}

function fallbackMetadataFromBeat(
  beat: BeatItem,
  projectMode: ProjectMode,
  colorGradePreset?: string,
  hasReferenceTag?: boolean
): SceneMetadata {
  return {
    sceneNumber: beat.beatNumber,
    phase: beat.phase,
    voLine: beat.voLine,
    sceneType: fallbackDirectorSceneTypeFromBeat(beat),
    shotType: fallbackShotTypeFromBeat(beat),
    shotGrammarPreset: beat.shotGrammarPreset,
    scenePurpose: beat.purpose,
    importance: beat.importance,
    useReferenceImage: hasReferenceTag ? beat.role === "hero" : false,
    cameraStyle: "",
    actionStyle: "",
    motionTemplateId: "",
    camera: fallbackCameraFromBeat(beat),
    lightingColor: fallbackLightingFromBeat(beat, projectMode, colorGradePreset),
  };
}

function alignMetadataScenesToBeatSheet(scenes: SceneMetadata[], beatSheet: BeatItem[]) {
  const expectedNumbers = beatSheet.map((beat) => beat.beatNumber);
  const actualNumbers = scenes.map((scene) => scene.sceneNumber);
  const actualSet = new Set(actualNumbers);

  const exactCoverage =
    scenes.length === beatSheet.length && expectedNumbers.every((sceneNumber) => actualSet.has(sceneNumber));

  if (exactCoverage) {
    return scenes;
  }

  const looksLikeOrdinalChunk =
    scenes.length === beatSheet.length &&
    actualNumbers.every((sceneNumber, index) => sceneNumber === index + 1) &&
    !expectedNumbers.every((sceneNumber, index) => sceneNumber === index + 1);

  if (looksLikeOrdinalChunk) {
    return scenes.map((scene, index) => ({
      ...scene,
      sceneNumber: beatSheet[index].beatNumber,
    }));
  }

  const missingSceneNumbers = expectedNumbers.filter((sceneNumber) => !actualSet.has(sceneNumber));
  throw new Error(`Scene metadata returned incomplete scene coverage. Missing scene numbers: ${missingSceneNumbers.join(", ")}.`);
}

async function generateMetadataBatch(
  client: ReturnType<typeof getOpenAIClient>,
  input: Parameters<typeof buildMetadataPrompt>[0],
  beatSheet: BeatItem[]
) {
  const response = await client.responses.create({
    model: getFilmPackModelName(),
    temperature: input.strictMode ? 0.15 : 0.35,
    max_output_tokens: Math.min(2200, 500 + beatSheet.length * 220),
    input: [
      {
        role: "user",
        content: buildMetadataPrompt({
          ...input,
          beatSheet,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        ...buildMetadataJsonSchema(beatSheet.length),
      },
    },
  });

  const raw = response.output_text;
  if (!raw) {
    throw new Error("No scene metadata returned from model.");
  }

  const parsed = parseMetadataPayload(raw);
  return {
    scenes: alignMetadataScenesToBeatSheet(parsed.scenes as SceneMetadata[], beatSheet),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = generateRequestSchema.parse(body);
    const strictMode = parsedBody.settings.strictMode ?? parsedBody.strict_mode ?? true;
    const referenceTag = parsedBody.settings.referenceTag?.trim() || "";
    const beatSheet = parsedBody.beatSheet
      ? preserveOriginalBeatNumbers(
          parsedBody.beatSheet,
          normalizeBeatSheet(
            parsedBody.beatSheet,
            parsedBody.beatSheet.length as 20 | 22 | 25 | 28 | 30,
            parsedBody.settings.projectMode || "singapore-realism"
          )
        )
      : undefined;

    if (!beatSheet?.length) {
      return NextResponse.json({ error: "Beat sheet is required for scene metadata generation." }, { status: 400 });
    }

    const client = getOpenAIClient();
    const generationInput = {
      beatSheet,
      title: parsedBody.settings.title,
      style: parsedBody.settings.style,
      colorGradePreset: parsedBody.settings.colorGradePreset,
      projectMode: parsedBody.settings.projectMode || "singapore-realism",
      fantasyBible: parsedBody.settings.fantasyBible,
      narratorCharacter: parsedBody.settings.narratorCharacter,
      onScreenCharacter: parsedBody.settings.onScreenCharacter,
      referenceTag,
      strictMode,
    } satisfies Parameters<typeof buildMetadataPrompt>[0];

    let parsed;
    try {
      parsed = await generateMetadataBatch(client, generationInput, beatSheet);
    } catch (error) {
      if (error instanceof Error && error.message === "Scene metadata model response was malformed JSON.") {
        parsed = await generateMetadataBatch(client, generationInput, beatSheet);
      } else {
        throw error;
      }
    }

    const byScene = new Map((parsed.scenes as SceneMetadata[]).map((scene) => [scene.sceneNumber, scene]));
    const missingBeats = beatSheet.filter((beat) => !byScene.has(beat.beatNumber));

    if (missingBeats.length > 0) {
      let retryParsed;
      try {
        retryParsed = await generateMetadataBatch(client, generationInput, missingBeats);
      } catch (error) {
        if (error instanceof Error && error.message === "Scene metadata model response was malformed JSON.") {
          retryParsed = await generateMetadataBatch(client, generationInput, missingBeats);
        } else {
          throw error;
        }
      }

      for (const scene of retryParsed.scenes as SceneMetadata[]) {
        byScene.set(scene.sceneNumber, scene);
      }
    }

    const scenes = beatSheet.map((beat) => {
      const scene = byScene.get(beat.beatNumber);
      const baseScene =
        scene ||
        fallbackMetadataFromBeat(
        beat,
        parsedBody.settings.projectMode || "singapore-realism",
        parsedBody.settings.colorGradePreset,
        Boolean(referenceTag)
      );
      const motionTemplate = pickKlingMotionTemplate({
        scene: baseScene,
        projectMode: parsedBody.settings.projectMode || "singapore-realism",
        style: parsedBody.settings.style,
      });
      return {
        ...baseScene,
        cameraStyle: baseScene.cameraStyle?.trim() || motionTemplate.cameraStyle,
        actionStyle: baseScene.actionStyle?.trim() || motionTemplate.actionStyle,
        motionTemplateId: baseScene.motionTemplateId?.trim() || motionTemplate.id,
      };
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid scene metadata request or output format." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unexpected scene metadata error." }, { status: 500 });
  }
}
