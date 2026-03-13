import { NextResponse } from "next/server";
import { z } from "zod";
import { getCompanionModelName, getOpenAIClient } from "@/lib/openai";
import type { CompanionShotKind, ScenePhase, SceneType } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const generateCompanionShotSchema = z.object({
  kind: z.union([z.literal("broll"), z.literal("transition")]),
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
    shotType: z.string().trim().min(1),
    shotGrammarPreset: z.string().optional().or(z.literal("")),
    scenePurpose: z.string().trim().min(1),
    importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
    useReferenceImage: z.boolean(),
    imagePrompt: z.string().trim().min(1),
    videoPrompt: z.string().trim().min(1),
    camera: z.string().optional().or(z.literal("")),
    lightingColor: z.string().optional().or(z.literal("")),
  }),
});

function fallbackCamera(kind: "broll" | "transition", shotType: string): string {
  if (kind === "transition") return "bridging frame with gentle lateral movement";
  if (/environment|insert|b-roll/i.test(shotType)) return "wide observational frame with restrained drift";
  return "controlled observational frame with subtle drift";
}

function fallbackLightingColor(input?: string) {
  return input?.trim() || "natural cinematic lighting, warm-neutral tones";
}

const responseSchema = {
  name: "companion_shot",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
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
      scenePurpose: { type: "string" },
      importance: { type: "string", enum: ["A", "B", "C"] },
      useReferenceImage: { type: "boolean" },
      imagePrompt: { type: "string" },
      videoPrompt: { type: "string" },
      camera: { type: "string" },
      lightingColor: { type: "string" },
    },
    required: [
      "phase",
      "voLine",
      "shotType",
      "shotGrammarPreset",
      "scenePurpose",
      "importance",
      "useReferenceImage",
      "imagePrompt",
      "videoPrompt",
      "camera",
      "lightingColor",
    ],
  },
} as const;

function buildPrompt(input: z.infer<typeof generateCompanionShotSchema>): string {
  return `Create one ${input.kind === "broll" ? "B-roll" : "transition"} companion shot for an existing film scene.

Rules:
- Keep the same story phase and same VO segment.
- Do not replace the main scene. This is an extra companion shot.
- Keep the same regional realism or fantasy context already established by the base scene setting note.
- Only one clearly visible character.
- If possible, reduce frontal face dependency.
- For broll: prefer environment, atmospheric insert, symbolic insert, transition B-roll.
- For transition: focus on bridging motion, space, mood, or time shift.
- Keep a related shot grammar family to the base scene, but shift it into a supporting angle rather than repeating the exact same frame.
- Importance should usually be B or C.
- Keep prompts concise and cinematic.
- Keep the same overall color grade family as the base scene and project lock.
- Do not shift from warm-neutral grading to cool-cyan grading, or the reverse, unless the base scene already does that.

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
- shot type: ${input.scene.shotType}
- shot grammar preset: ${input.scene.shotGrammarPreset || "(not provided)"}
- purpose: ${input.scene.scenePurpose}
- importance: ${input.scene.importance}
- reference image: ${input.scene.useReferenceImage ? "yes" : "no"}
- image prompt: ${input.scene.imagePrompt}
- video prompt: ${input.scene.videoPrompt}
- camera: ${input.scene.camera?.trim() || fallbackCamera(input.kind, input.scene.shotType)}
- lighting/color: ${fallbackLightingColor(input.scene.lightingColor)}

Return one JSON object only.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = generateCompanionShotSchema.parse(body);

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getCompanionModelName(),
      temperature: parsed.strictMode === false ? 0.55 : 0.25,
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
      return NextResponse.json({ error: "No companion shot returned." }, { status: 502 });
    }

    const payload = JSON.parse(raw) as {
      phase: ScenePhase;
      voLine: string;
      shotType: SceneType;
      shotGrammarPreset: string;
      scenePurpose: string;
      importance: "A" | "B" | "C";
      useReferenceImage: boolean;
      imagePrompt: string;
      videoPrompt: string;
      camera: string;
      lightingColor: string;
    };

    const shot = {
      id: crypto.randomUUID(),
      parentSceneNumber: parsed.scene.sceneNumber,
      label: parsed.kind === "broll" ? `Scene ${parsed.scene.sceneNumber}B` : `Scene ${parsed.scene.sceneNumber}T`,
      kind: parsed.kind as CompanionShotKind,
      ...payload,
    };

    return NextResponse.json({ shot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid companion shot request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unexpected companion shot error." }, { status: 500 });
  }
}
