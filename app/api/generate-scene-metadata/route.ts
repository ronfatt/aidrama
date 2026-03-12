import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeBeatSheet } from "@/lib/beat-sheet";
import { getFilmPackModelName, getOpenAIClient } from "@/lib/openai";
import { generateRequestSchema } from "@/lib/schemas";
import type { BeatItem, FantasyBibleInput, ProjectMode, SceneMetadata } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const metadataSchema = z.object({
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
  ),
});

const metadataJsonSchema = {
  name: "scene_metadata",
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
            "camera",
            "lightingColor",
          ],
        },
      },
    },
    required: ["scenes"],
  },
} as const;

function beatLine(beat: BeatItem) {
  return `${beat.beatNumber}. [${beat.phase}] storyArc="${beat.storyArc}" role=${beat.role} importance=${beat.importance} visualRole="${beat.visualRole}" framingIntent="${beat.framingIntent}" vo="${beat.voLine}" purpose="${beat.purpose}"`;
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
- Do not repeat the same portrait setup in consecutive scenes.
- At least 25 percent of scenes must avoid front-facing portrait framing.
- If no reference tag is provided, set useReferenceImage=false for all scenes.
- If narrator and on-screen character differ, prioritize the on-screen character visually.
- Keep metadata concise and practical.
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = generateRequestSchema.parse(body);
    const strictMode = parsedBody.settings.strictMode ?? parsedBody.strict_mode ?? true;
    const referenceTag = parsedBody.settings.referenceTag?.trim() || "";
    const beatSheet = parsedBody.beatSheet
      ? normalizeBeatSheet(
          parsedBody.beatSheet,
          parsedBody.beatSheet.length as 20 | 22 | 25 | 28 | 30,
          parsedBody.settings.projectMode || "singapore-realism"
        )
      : undefined;

    if (!beatSheet?.length) {
      return NextResponse.json({ error: "Beat sheet is required for scene metadata generation." }, { status: 400 });
    }

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getFilmPackModelName(),
      temperature: strictMode ? 0.15 : 0.35,
      max_output_tokens: 4500,
      input: [
        {
          role: "user",
          content: buildMetadataPrompt({
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
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...metadataJsonSchema,
        },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      throw new Error("No scene metadata returned from model.");
    }

    const parsed = metadataSchema.parse(JSON.parse(raw));
    const scenes = parsed.scenes as SceneMetadata[];

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
