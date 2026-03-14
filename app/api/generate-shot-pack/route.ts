import { NextResponse } from "next/server";
import { z } from "zod";
import { pickKlingMotionTemplate } from "@/lib/kling-motion";
import { getCompanionModelName, getOpenAIClient } from "@/lib/openai";
import type { CompanionShot, CompanionShotKind, FilmTone, ProjectMode, ScenePhase, SceneType } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const generateShotPackSchema = z.object({
  title: z.string().min(1),
  style: z.string().min(1),
  colorGradePreset: z.string().optional().or(z.literal("")),
  settingNote: z.string().min(1),
  characterReferenceGuidance: z.string().min(1),
  referenceTag: z.string().optional().or(z.literal("")),
  projectColorGradeLock: z.string().optional().or(z.literal("")),
  strictMode: z.boolean().optional(),
  scene: z.object({
    sceneNumber: z.number().int().positive(),
    phase: z.string().trim().min(1),
    voLine: z.string().trim().min(1),
    sceneType: z.union([z.literal("action"), z.literal("dialogue"), z.literal("environment"), z.literal("emotional")]).optional(),
    shotType: z.string().trim().min(1),
    shotGrammarPreset: z.string().optional().or(z.literal("")),
    cameraStyle: z.string().optional().or(z.literal("")),
    actionStyle: z.string().optional().or(z.literal("")),
    scenePurpose: z.string().trim().min(1),
    importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
    useReferenceImage: z.boolean(),
    imagePrompt: z.string().trim().min(1),
    videoPrompt: z.string().trim().min(1),
    camera: z.string().optional().or(z.literal("")),
    lightingColor: z.string().optional().or(z.literal("")),
  }),
});

const responseSchema = {
  name: "shot_pack",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      shots: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            kind: { type: "string", enum: ["broll", "transition"] },
            phase: {
              type: "string",
              enum: [
                "Opening - Awareness",
                "Understanding - Reframing",
                "Turning Point - Action",
                "Impact - Closing",
              ],
            },
            voLine: { type: "string" },
            sceneType: { type: "string", enum: ["action", "dialogue", "environment", "emotional"] },
            shotType: {
              type: "string",
              enum: [
                "environment",
                "character close-up",
                "behavior shot",
                "symbolic insert",
                "transition B-roll",
                "atmospheric insert",
                "POV shot",
                "over-shoulder shot",
              ],
            },
            shotGrammarPreset: { type: "string" },
            cameraStyle: { type: "string" },
            actionStyle: { type: "string" },
            motionTemplateId: { type: "string" },
            scenePurpose: { type: "string" },
            importance: { type: "string", enum: ["A", "B", "C"] },
            useReferenceImage: { type: "boolean" },
            imagePrompt: { type: "string" },
            videoPrompt: { type: "string" },
            camera: { type: "string" },
            lightingColor: { type: "string" },
          },
          required: [
            "label",
            "kind",
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
            "imagePrompt",
            "videoPrompt",
            "camera",
            "lightingColor",
          ],
        },
      },
    },
    required: ["shots"],
  },
} as const;

function inferProjectMode(settingNote: string): ProjectMode {
  const lower = settingNote.toLowerCase();
  if (lower.includes("tawau") || lower.includes("sabah")) return "tawau-sabah-realism";
  if (lower.includes("fantasy") || lower.includes("coastal") || lower.includes("mythic")) return "coastal-fantasy-drama";
  return "singapore-realism";
}

function buildPrompt(input: z.infer<typeof generateShotPackSchema>) {
  return `Create a multi-shot scene pack for one existing scene.

Return 3 to 5 supporting shots as JSON only.

Rules:
- These are extra supporting shots, not replacements for the main scene.
- Keep the same story phase and same VO segment family.
- Create a proper mini shot sequence with visual variation.
- At least one shot should feel like environment or spatial context.
- At least one shot should feel like reaction / emotional detail / symbolic or cutaway support.
- Do not make all shots the same framing.
- Keep only one clearly visible character per shot.
- Respect the established location, color grade, and story world.
- Keep the same reference-image logic as the base scene unless a supporting shot clearly works better without a face.
- Use concise production-friendly prompts.
- Video prompts should keep explicit camera movement and short action timeline.
- Use a mix of broll and transition kinds where useful.

Project:
- title: ${input.title}
- style: ${input.style}
- color grade preset: ${input.colorGradePreset || "(not provided)"}
- setting: ${input.settingNote}
- character guidance: ${input.characterReferenceGuidance}
- reference tag: ${input.referenceTag || "(none)"}
- project color grade lock: ${input.projectColorGradeLock || input.scene.lightingColor}

Base scene:
- scene number: ${input.scene.sceneNumber}
- phase: ${input.scene.phase}
- vo line: ${input.scene.voLine}
- scene type: ${input.scene.sceneType || "emotional"}
- shot type: ${input.scene.shotType}
- shot grammar preset: ${input.scene.shotGrammarPreset || "(not provided)"}
- camera style: ${input.scene.cameraStyle || "(not provided)"}
- action style: ${input.scene.actionStyle || "(not provided)"}
- purpose: ${input.scene.scenePurpose}
- importance: ${input.scene.importance}
- reference image: ${input.scene.useReferenceImage ? "yes" : "no"}
- image prompt: ${input.scene.imagePrompt}
- video prompt: ${input.scene.videoPrompt}
- camera: ${input.scene.camera || "(not provided)"}
- lighting/color: ${input.scene.lightingColor || "(not provided)"}

Return a shot pack that feels like a director expanded this one scene into 3-5 useful editorial shots.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = generateShotPackSchema.parse(body);

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getCompanionModelName(),
      temperature: parsed.strictMode === false ? 0.55 : 0.25,
      max_output_tokens: 2500,
      input: [{ role: "user", content: buildPrompt(parsed) }],
      text: {
        format: {
          type: "json_schema",
          ...responseSchema,
        },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      return NextResponse.json({ error: "No shot pack returned." }, { status: 502 });
    }

    const payload = JSON.parse(raw) as {
      shots: Array<{
        label: string;
        kind: CompanionShotKind;
        phase: ScenePhase;
        voLine: string;
        sceneType: "action" | "dialogue" | "environment" | "emotional";
        shotType: SceneType;
        shotGrammarPreset: string;
        cameraStyle: string;
        actionStyle: string;
        motionTemplateId: string;
        scenePurpose: string;
        importance: "A" | "B" | "C";
        useReferenceImage: boolean;
        imagePrompt: string;
        videoPrompt: string;
        camera: string;
        lightingColor: string;
      }>;
    };

    const projectMode = inferProjectMode(parsed.settingNote);
    const shots: CompanionShot[] = payload.shots.map((shot, index) => {
      const motionTemplate = pickKlingMotionTemplate({
        scene: {
          sceneNumber: parsed.scene.sceneNumber,
          shotType: shot.shotType,
          shotGrammarPreset: shot.shotGrammarPreset,
          scenePurpose: shot.scenePurpose,
          camera: shot.camera,
          lightingColor: shot.lightingColor,
        },
        projectMode,
        style: parsed.style as FilmTone,
      });

      return {
        id: crypto.randomUUID(),
        parentSceneNumber: parsed.scene.sceneNumber,
        label: shot.label?.trim() || `Scene ${parsed.scene.sceneNumber}.${index + 1}`,
        kind: shot.kind,
        phase: shot.phase,
        voLine: shot.voLine,
        sceneType: shot.sceneType,
        shotType: shot.shotType,
        shotGrammarPreset: shot.shotGrammarPreset,
        cameraStyle: shot.cameraStyle?.trim() || motionTemplate.cameraStyle,
        actionStyle: shot.actionStyle?.trim() || motionTemplate.actionStyle,
        motionTemplateId: shot.motionTemplateId?.trim() || motionTemplate.id,
        scenePurpose: shot.scenePurpose,
        importance: shot.importance,
        useReferenceImage: shot.useReferenceImage,
        imagePrompt: shot.imagePrompt,
        videoPrompt: shot.videoPrompt,
        camera: shot.camera,
        lightingColor: shot.lightingColor,
      };
    });

    return NextResponse.json({ shots });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid shot pack request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unexpected shot pack error." }, { status: 500 });
  }
}
