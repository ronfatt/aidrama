import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { normalizeBeatSheet, phaseByPosition } from "@/lib/beat-sheet";
import { getBeatModelName, getOpenAIClient } from "@/lib/openai";
import { FANTASY_LOCATION_VOCABULARY } from "@/lib/constants";
import { generateRequestSchema } from "@/lib/schemas";
import { resolveSceneCount } from "@/lib/scene-count";
import { splitVoiceOverIntoSceneBeats } from "@/lib/vo-segmentation";
import type { FantasyBibleInput, ProjectMode } from "@/types/film-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const beatSheetResponseSchema = z.object({
  beats: z.array(
    z.object({
      beatNumber: z.number().int().positive(),
      phase: z.string(),
      storyArc: z.string().min(1),
      shotGrammarPreset: z.string().min(1),
      role: z.string(),
      importance: z.string(),
      voLine: z.string().min(1),
      purpose: z.string().min(1),
      visualRole: z.string().min(1),
      framingIntent: z.string().min(1),
    })
  ),
});

const beatSheetJsonSchema = {
  name: "beat_sheet",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      beats: {
        type: "array",
        minItems: 20,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            beatNumber: { type: "integer" },
            phase: { type: "string" },
            storyArc: { type: "string" },
            shotGrammarPreset: { type: "string" },
            role: { type: "string" },
            importance: { type: "string" },
            voLine: { type: "string" },
            purpose: { type: "string" },
            visualRole: { type: "string" },
            framingIntent: { type: "string" },
          },
          required: ["beatNumber", "phase", "storyArc", "shotGrammarPreset", "role", "importance", "voLine", "purpose", "visualRole", "framingIntent"],
        },
      },
    },
    required: ["beats"],
  },
} as const;

function buildBeatPrompt({
  sourceText,
  sceneCount,
  style,
  colorGradePreset,
  projectMode,
  fantasyBible,
  narratorCharacter,
  onScreenCharacter,
  lockedVoiceOver,
  strictMode,
  beatLines,
}: {
  sourceText: string;
  sceneCount: number;
  style: string;
  colorGradePreset?: string;
  projectMode: ProjectMode;
  fantasyBible?: FantasyBibleInput;
  narratorCharacter?: string;
  onScreenCharacter?: string;
  lockedVoiceOver: string;
  strictMode: boolean;
  beatLines?: string[];
}) {
  const nonHeroTarget = sceneCount >= 25 ? "5" : "4";
  const modeRules =
    projectMode === "coastal-fantasy-drama"
      ? `
- Build a 2-minute coastal fantasy drama progression: ordinary life, first sign, rising threat, confrontation, and hook ending.
- Keep the world grounded in a modern Southeast Asian coastal city while allowing supernatural ocean power imagery.
- Use the fantasy bible as a hard anchor for hero identity, power language, power limits, enemy logic, world tone, and ending hook.
- Mix intimate character beats with atmospheric coastal beats, reflective water motifs, threshold frames, enemy-presence hints, and controlled power emergence.
- Not every beat should show spectacle. Include anticipation, fear, aftermath, restraint, and awe.
- Allow settings like shoreline estates, breakwaters, jetties, harbours, storm drains, sea-facing rooftops, and wet urban edges.
- Maintain single-character staging even when enemies are implied; show threat through shadow, wake, reflection, silhouette, spray, or aftermath rather than two visible faces.
`
      : `
- Keep Singapore realism and single-character production logic in mind.
- Use grounded Singapore heartland spaces such as HDB flats, corridors, void decks, MRT, hawker centres, neighbourhood streets, parks, and small apartments.
- Preserve documentary-emotional realism rather than fantasy spectacle.
`;
  const fantasyBibleBlock =
    projectMode === "coastal-fantasy-drama"
      ? `
Fantasy bible:
- core premise: ${fantasyBible?.corePremise?.trim() || "not provided"}
- hero name: ${fantasyBible?.heroName?.trim() || onScreenCharacter || "not provided"}
- power type: ${fantasyBible?.powerType?.trim() || "not provided"}
- power limits: ${fantasyBible?.powerLimits?.trim() || "not provided"}
- enemy type: ${fantasyBible?.enemyType?.trim() || "not provided"}
- world tone: ${fantasyBible?.worldTone?.trim() || "not provided"}
- ending hook: ${fantasyBible?.endingHook?.trim() || "not provided"}

Preferred location vocabulary:
${FANTASY_LOCATION_VOCABULARY.map((location) => `- ${location}`).join("\n")}
`
      : "";

  return `
You are building a beat sheet for a short cinematic film pack.

Return valid JSON only.

Goals:
- Cover the full story in order with exactly ${sceneCount} beats.
- Keep 4 story phases in order:
  Opening - Awareness
  Understanding - Reframing
  Turning Point - Action
  Impact - Closing
- Output storyArc for every beat.
- Output shotGrammarPreset for every beat.
- Include about ${nonHeroTarget} non-hero beats total using role=broll or role=transition.
- Every other beat should stay role=hero unless there is a clear reason not to.
- importance should usually be A for hero, B for broll, C for transition.
- Use concise purpose lines for each beat.
- Create visible shot grammar variation across the sequence.
- project mode is ${projectMode}.
${modeRules}

Story arc rules:
${
  projectMode === "coastal-fantasy-drama"
    ? `- Use these exact storyArc labels in order across the beat sheet:
  Ordinary World
  First Sign
  Escalation
  Confrontation
  Hook Ending`
    : `- Use phase-aligned storyArc labels that stay grounded and concise, such as Grounding, Recognition, Movement, and Resolution.`
}

Hard rules:
- Do not add new facts, events, people, or locations.
- Preserve source meaning and sequence.
- If beat lines are provided, keep each voLine exactly as provided.
- Beat count must be exactly ${sceneCount}.
- strict mode is ${strictMode ? "ON" : "OFF"}.
- style is ${style}.
- color grade preset is ${colorGradePreset || "not provided"}.
- narrator / POV character is ${narratorCharacter || "not provided"}.
- primary on-screen character is ${onScreenCharacter || "not provided"}.
- if narrator and on-screen character are different, annotate beats primarily around the on-screen character, not the narrator.
- Output visualRole and framingIntent for every beat.
- Use shotGrammarPreset as a concrete visual grammar label for the beat's intended reveal style.
- Do not let consecutive beats repeat the same portrait logic.
- Avoid runs of static front-facing close portraits.
- Vary framing using combinations such as intimate close portrait, environmental distance, over-shoulder witness, back-view withdrawal, doorway threshold frame, reflection composition, negative space frame, object detail insert, hands and gesture detail, corridor transition frame, architectural wide.
- At least 25 percent of beats should avoid front-facing portrait framing.
${
  projectMode === "coastal-fantasy-drama"
    ? `
- Use fantasy-oriented shotGrammarPreset labels such as:
  grounded witness frame
  power reveal detail
  water omen reveal
  unstable power frame
  charged pursuit frame
  enemy reveal silhouette
  impact backlash frame
  mythic aftermath frame
  threat-on-horizon frame
  coastal omen insert`
    : `
- Use grounded shotGrammarPreset labels such as:
  intimate witness frame
  threshold observation frame
  environmental distance frame
  reflection realism frame
  observational bridge frame
  symbolic detail insert`
}

${fantasyBibleBlock}

${lockedVoiceOver ? `Locked voice over:\n${lockedVoiceOver}\n` : ""}

${
  beatLines?.length
    ? `Beat lines to annotate exactly:\n${beatLines.map((line, index) => `${index + 1}. ${line}`).join("\n")}\n`
    : ""
}

Source text:
${sourceText.trim()}
`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = generateRequestSchema.parse(body);

    const strictMode = parsedBody.settings.strictMode ?? parsedBody.strict_mode ?? true;
    const lockedVoiceOver = parsedBody.settings.lockedVoiceOver?.trim() || "";
    const sceneCount = resolveSceneCount(parsedBody.settings.sceneCount, {
      lockedVoiceOver,
      originalScript: parsedBody.settings.originalScript,
    });

    const beatLines = lockedVoiceOver
      ? splitVoiceOverIntoSceneBeats(lockedVoiceOver, sceneCount)
      : undefined;

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getBeatModelName(),
      temperature: strictMode ? 0.15 : 0.4,
      input: [
        {
          role: "user",
          content: buildBeatPrompt({
            sourceText: parsedBody.settings.originalScript,
            sceneCount,
            style: parsedBody.settings.style,
            colorGradePreset: parsedBody.settings.colorGradePreset,
            projectMode: parsedBody.settings.projectMode || "singapore-realism",
            fantasyBible: parsedBody.settings.fantasyBible,
            narratorCharacter: parsedBody.settings.narratorCharacter,
            onScreenCharacter: parsedBody.settings.onScreenCharacter,
            lockedVoiceOver,
            strictMode,
            beatLines,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...beatSheetJsonSchema,
        },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      throw new Error("No beat sheet returned from model.");
    }

    const parsed = beatSheetResponseSchema.parse(JSON.parse(raw));
    let beatSheet = normalizeBeatSheet(parsed.beats, sceneCount, parsedBody.settings.projectMode || "singapore-realism");

    if (beatLines?.length) {
      beatSheet = beatSheet.map((beat, index) => ({
        ...beat,
        voLine: beatLines[index] || beat.voLine,
        phase: beat.phase || phaseByPosition(index, sceneCount),
      }));
    }

    if (beatSheet.length !== sceneCount) {
      return NextResponse.json(
        { error: `Beat sheet returned ${beatSheet.length} beats; expected ${sceneCount}.` },
        { status: 502 }
      );
    }

    return NextResponse.json({ beatSheet, sceneCount });
  } catch (error) {
    if (error instanceof ZodError) {
      const referenceTagError = error.issues.find((issue) => issue.path.join(".") === "settings.referenceTag")?.message;
      return NextResponse.json(
        {
          error: referenceTagError || "Invalid beat sheet request or output format.",
          details: error.flatten(),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
