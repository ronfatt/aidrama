import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getFilmPackModelName, getOpenAIClient } from "@/lib/openai";
import { normalizeBeatSheet } from "@/lib/beat-sheet";
import { enforceFilmPackGuardrails } from "@/lib/output-guardrails";
import { buildPrompt } from "@/lib/prompts/promptBuilder";
import { filmPackJsonSchema } from "@/lib/prompts/outputSchema";
import { filmPackSchema, generateRequestSchema } from "@/lib/schemas";
import { passesVoFidelity } from "@/lib/vo-fidelity";
import { resolveSceneCount } from "@/lib/scene-count";
import { splitVoiceOverIntoSceneBeats } from "@/lib/vo-segmentation";
import type { BeatItem, FilmPack, SceneItem } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scenesOnlyJsonSchema = {
  name: "film_pack_scenes",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scenes: {
        type: "array",
        minItems: 20,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sceneNumber: { type: "integer" },
            phase: { type: "string" },
            voLine: { type: "string" },
            shotType: { type: "string" },
            scenePurpose: { type: "string" },
            importance: { type: "string", enum: ["A", "B", "C"] },
            useReferenceImage: { type: "boolean" },
            imagePrompt: { type: "string" },
            videoPrompt: { type: "string" },
            camera: { type: "string" },
            lightingColor: { type: "string" },
          },
          required: [
            "sceneNumber",
            "phase",
            "voLine",
            "shotType",
            "scenePurpose",
            "importance",
            "useReferenceImage",
            "imagePrompt",
            "videoPrompt",
            "camera",
            "lightingColor",
          ],
        },
      },
    },
    required: ["scenes"],
  },
} as const;

function buildScenesOnlyPrompt({
  beatSheet,
  title,
  style,
  colorGradePreset,
  projectMode,
  narratorCharacter,
  onScreenCharacter,
  referenceTag,
  strictMode,
}: {
  beatSheet: BeatItem[];
  title?: string;
  style: string;
  colorGradePreset?: string;
  projectMode?: "singapore-realism" | "tawau-sabah-realism" | "coastal-fantasy-drama";
  narratorCharacter?: string;
  onScreenCharacter?: string;
  referenceTag?: string;
  strictMode: boolean;
}) {
  return `
Generate scene production data from this beat sheet.

Return valid JSON only with this exact shape:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "phase": "string",
      "voLine": "string",
      "shotType": "string",
      "scenePurpose": "string",
      "importance": "A | B | C",
      "useReferenceImage": true,
      "imagePrompt": "string",
      "videoPrompt": "string",
      "camera": "string",
      "lightingColor": "string"
    }
  ]
}

Production settings:
- title: ${title?.trim() || "(not provided)"}
- style: ${style}
- color grade preset: ${colorGradePreset || "(not provided)"}
- narrator / POV character: ${narratorCharacter?.trim() || "(not provided)"}
- primary on-screen character: ${onScreenCharacter?.trim() || "(not provided)"}
- main reference tag: ${referenceTag?.trim() || "(not provided)"}
- strict mode: ${strictMode ? "ON" : "OFF"}
- project mode: ${projectMode || "singapore-realism"}

Hard rules:
- Use the beat sheet as the only story source of truth.
- Do not add new facts, events, places, or people.
- Keep all scenes in ${
    projectMode === "tawau-sabah-realism" ? "Tawau, Sabah" : projectMode === "coastal-fantasy-drama" ? "a Southeast Asian coastal fantasy world" : "Singapore"
  }.
- Only one clearly visible character per scene.
- If narrator and on-screen character differ, prioritize the on-screen character visually.
- Use POV / over-shoulder / back view / silhouette when narrator presence is needed.
- Keep prompts concise and practical for Kling / Gemini still generation and image-to-video workflow.
- Maintain a consistent color grade family across the project.
- If no reference tag is provided, set useReferenceImage=false for all scenes.
- If a beat role is broll or transition, prefer environment / symbolic insert / transition B-roll / atmospheric insert.
- Do not repeat the same portrait setup in consecutive scenes.
- Alternate between portrait, environmental, over-shoulder, back-view, object-detail, reflection, threshold, and negative-space framings.
- Use beat.visualRole and beat.framingIntent as hard composition instructions.
- At least 25 percent of scenes must avoid front-facing portrait framing.
- Scene count must match beat count exactly.

Beat sheet:
${beatSheet
  .map(
    (beat) =>
      `${beat.beatNumber}. [${beat.phase}] role=${beat.role} importance=${beat.importance} visualRole="${beat.visualRole}" framingIntent="${beat.framingIntent}" vo="${beat.voLine}" purpose="${beat.purpose}"`
  )
  .join("\n")}
`;
}

function buildSettingNote(style: string, projectMode: "singapore-realism" | "tawau-sabah-realism" | "coastal-fantasy-drama" = "singapore-realism") {
  if (projectMode === "tawau-sabah-realism") {
    return `All scenes are set in Tawau, Sabah civic and neighborhood spaces with a contemporary visual bias: modern municipal offices, cleaner shopfronts, upgraded roadsides, maintained jetties, renovated kampung air walkways, schools, clinics, housing frontages, and organized local service depots. Visual tone is ${style}, grounded in local textures and documentary realism but framed with present-day municipal clarity, cleaner modern architecture, and contemporary color contrast. Avoid retro, overly aged, or derelict building reads unless explicitly required by the story.`;
  }
  return `All scenes are set in contemporary Singapore heartland spaces: HDB flats, corridors, void decks, MRT, hawker centres, neighbourhood parks and small apartments. Visual tone is ${style}, grounded in local textures and documentary realism.`;
}

function buildCharacterReferenceGuidance({
  referenceTag,
  onScreenCharacter,
  narratorCharacter,
}: {
  referenceTag: string;
  onScreenCharacter?: string;
  narratorCharacter?: string;
}) {
  if (!referenceTag) {
    return "No character reference workflow is active for this film pack.";
  }

  const subject = onScreenCharacter?.trim() || "the main on-screen character";
  const narratorNote =
    narratorCharacter?.trim() && narratorCharacter.trim() !== subject
      ? ` Keep ${narratorCharacter.trim()} mainly as POV, over-shoulder, back view, silhouette, or off-screen presence when needed.`
      : "";

  return `Use ${referenceTag} consistently whenever ${subject} appears. Do not redefine facial identity; focus on pose, framing, environment, wardrobe variation, mood, and lighting.${narratorNote}`;
}

function assembleFilmPackFromScenes({
  scenes,
  beatSheet,
  settings,
  lockedVoiceOver,
  referenceTag,
}: {
  scenes: SceneItem[];
  beatSheet: BeatItem[];
  settings: {
    title?: string;
    projectMode?: "singapore-realism" | "tawau-sabah-realism" | "coastal-fantasy-drama";
    style: FilmPack["style"];
    colorGradePreset?: FilmPack["colorGradePreset"];
    narratorCharacter?: string;
    onScreenCharacter?: string;
  };
  lockedVoiceOver: string;
  referenceTag: string;
}): FilmPack {
  return {
    title: settings.title?.trim() || "Untitled Film Pack",
    style: settings.style,
    colorGradePreset: settings.colorGradePreset,
    settingNote: buildSettingNote(settings.style, settings.projectMode || "singapore-realism"),
    preservedVoiceOverScript: lockedVoiceOver || beatSheet.map((beat) => beat.voLine).join(" "),
    characterReferenceGuidance: buildCharacterReferenceGuidance({
      referenceTag,
      onScreenCharacter: settings.onScreenCharacter,
      narratorCharacter: settings.narratorCharacter,
    }),
    beatSheet,
    scenes,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = generateRequestSchema.parse(body);

    const strictMode = parsedBody.settings.strictMode ?? parsedBody.strict_mode ?? true;
    const lockedVoiceOver = parsedBody.settings.lockedVoiceOver?.trim() || "";
    const referenceTag = parsedBody.settings.referenceTag?.trim() || "";
    const sceneCount = resolveSceneCount(parsedBody.settings.sceneCount, {
      lockedVoiceOver,
      originalScript: parsedBody.settings.originalScript,
    });
    const providedBeatSheet =
      parsedBody.beatSheet && parsedBody.beatSheet.length === sceneCount
        ? normalizeBeatSheet(parsedBody.beatSheet, sceneCount)
        : undefined;
    const sceneBeats = providedBeatSheet?.map((beat) => beat.voLine)
      ?? (lockedVoiceOver ? splitVoiceOverIntoSceneBeats(lockedVoiceOver, sceneCount) : undefined);

    const client = getOpenAIClient();

    const generateOnce = async (extraInstruction?: string) => {
      const response = await client.responses.create({
        model: getFilmPackModelName(),
        temperature: strictMode ? 0.18 : 0.55,
        max_output_tokens: 9000,
        input: [
          {
            role: "user",
            content: buildPrompt(parsedBody.settings.originalScript, {
              title: parsedBody.settings.title,
              projectMode: parsedBody.settings.projectMode,
              narratorCharacter: parsedBody.settings.narratorCharacter,
              onScreenCharacter: parsedBody.settings.onScreenCharacter,
              referenceTag,
              lockedVoiceOver,
              sceneCount,
              style: parsedBody.settings.style,
              colorGradePreset: parsedBody.settings.colorGradePreset,
              fantasyBible: parsedBody.settings.fantasyBible,
              strictMode,
              sceneBeats,
              beatSheet: providedBeatSheet,
              extraInstruction,
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
        throw new Error("No content returned from model.");
      }

      const candidate = JSON.parse(raw);
      const parsedFilmPack = filmPackSchema.parse(candidate);
      return enforceFilmPackGuardrails(parsedFilmPack, { strictMode });
    };

    let filmPack: FilmPack;
    if (providedBeatSheet) {
      const response = await client.responses.create({
        model: getFilmPackModelName(),
        temperature: strictMode ? 0.15 : 0.4,
        max_output_tokens: 7000,
        input: [
          {
            role: "user",
            content: buildScenesOnlyPrompt({
              beatSheet: providedBeatSheet,
              title: parsedBody.settings.title,
              projectMode: parsedBody.settings.projectMode,
              style: parsedBody.settings.style,
              colorGradePreset: parsedBody.settings.colorGradePreset,
              narratorCharacter: parsedBody.settings.narratorCharacter,
              onScreenCharacter: parsedBody.settings.onScreenCharacter,
              referenceTag,
              strictMode,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            ...scenesOnlyJsonSchema,
          },
        },
      });

      const raw = response.output_text;
      if (!raw) {
        throw new Error("No scene data returned from model.");
      }

      const candidate = JSON.parse(raw) as { scenes: SceneItem[] };
      const parsedScenes = candidate.scenes.map((scene) => scene);
      filmPack = enforceFilmPackGuardrails(
        assembleFilmPackFromScenes({
          scenes: parsedScenes,
          beatSheet: providedBeatSheet,
        settings: {
          title: parsedBody.settings.title,
          projectMode: parsedBody.settings.projectMode,
          style: parsedBody.settings.style,
            colorGradePreset: parsedBody.settings.colorGradePreset,
            narratorCharacter: parsedBody.settings.narratorCharacter,
            onScreenCharacter: parsedBody.settings.onScreenCharacter,
          },
          lockedVoiceOver,
          referenceTag,
        }),
        { strictMode }
      );
    } else {
      filmPack = await generateOnce();
    }

    if (filmPack.scenes.length !== sceneCount) {
      return NextResponse.json(
        {
          error: `Model returned ${filmPack.scenes.length} scenes; expected ${sceneCount}. Please retry.`,
        },
        { status: 502 }
      );
    }

    if (lockedVoiceOver) {
      filmPack = {
        ...filmPack,
        preservedVoiceOverScript: lockedVoiceOver,
        scenes: filmPack.scenes.map((scene, index) => ({
          ...scene,
          voLine: sceneBeats?.[index] || scene.voLine,
        })),
      };
    } else if (!passesVoFidelity(parsedBody.settings.originalScript, filmPack.preservedVoiceOverScript, strictMode)) {
      return NextResponse.json(
        {
          error:
            "Film pack generated, but VO drifted too far from source script. Retry with Strict Mode ON or provide Locked VO Script.",
        },
        { status: 502 }
      );
    }

    if (providedBeatSheet) {
      filmPack = {
        ...filmPack,
        beatSheet: providedBeatSheet,
        scenes: filmPack.scenes.map((scene, index) => {
          const beat = providedBeatSheet[index];
          if (!beat) return scene;

          return {
            ...scene,
            phase: beat.phase,
            importance: beat.importance,
            voLine: beat.voLine,
            shotType:
              beat.role === "transition"
                ? "transition B-roll"
                : beat.role === "broll" &&
                    !["environment", "symbolic insert", "transition B-roll", "atmospheric insert"].includes(
                      scene.shotType
                    )
                  ? "atmospheric insert"
                  : scene.shotType,
            scenePurpose:
              beat.role === "hero"
                ? scene.scenePurpose
                : `${beat.role === "transition" ? "Transition coverage" : "B-roll coverage"}: ${beat.purpose}`,
          };
        }),
      };
    }

    if (!referenceTag) {
      filmPack = {
        ...filmPack,
        characterReferenceGuidance: "No character reference workflow is active for this film pack.",
        scenes: filmPack.scenes.map((scene) => ({
          ...scene,
          useReferenceImage: false,
        })),
      };
    }

    filmPack = {
      ...filmPack,
      colorGradePreset: parsedBody.settings.colorGradePreset,
    };

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
