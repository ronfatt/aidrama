import { outputSchema } from "@/lib/prompts/outputSchema";
import { sceneRules } from "@/lib/prompts/sceneRules";
import { stylePrompt } from "@/lib/prompts/stylePrompt";
import { systemPrompt } from "@/lib/prompts/systemPrompt";

interface PromptOptions {
  title?: string;
  narratorCharacter?: string;
  onScreenCharacter?: string;
  referenceTag?: string;
  lockedVoiceOver?: string;
  sceneCount: 20 | 22 | 25 | 28 | 30;
  style: "cinematic documentary" | "psychological drama" | "NGO educational" | "emotional realism";
  colorGradePreset?:
    | "warm-neutral documentary"
    | "neutral-cool restraint"
    | "muted realism"
    | "soft warm intimacy";
  strictMode: boolean;
  sceneBeats?: string[];
  beatSheet?: Array<{
    beatNumber: number;
    phase: string;
    role: string;
    importance: string;
    voLine: string;
    purpose: string;
    visualRole: string;
    framingIntent: string;
  }>;
  extraInstruction?: string;
}

export function buildPrompt(script: string, options: PromptOptions) {
  const hasBeatSheet = Boolean(options.beatSheet?.length);
  const hasLockedVoiceOver = Boolean(options.lockedVoiceOver?.trim());
  const beatSheetBlock = options.beatSheet?.length
    ? `Beat sheet to follow exactly in order:\n${options.beatSheet
        .map(
          (beat) =>
            `${beat.beatNumber}. [${beat.phase}] role=${beat.role} importance=${beat.importance} visualRole="${beat.visualRole}" framingIntent="${beat.framingIntent}" vo="${beat.voLine}" purpose="${beat.purpose}"`
        )
        .join("\n")}\n`
    : "";
  const sceneBeatBlock =
    !hasBeatSheet && options.sceneBeats?.length
      ? `Scene beat map (must cover all beats in order):\n${options.sceneBeats
          .map((beat, index) => `${index + 1}. ${beat}`)
          .join("\n")}\n`
      : "";
  const lockedVoiceOverBlock =
    hasLockedVoiceOver && !hasBeatSheet
      ? `Locked voice over (must be used exactly):\n${options.lockedVoiceOver!.trim()}\n`
      : "";
  const sourceBlock = hasBeatSheet
    ? `Source handling mode: beat-sheet driven expansion.

Use the provided beat sheet as the primary source of truth for scene order, phase, role, importance, and voLine.
Do not re-interpret the full story or add missing plot details.
Expand only from the beat sheet into practical scene prompts.`
    : `Script to convert:

${script.trim()}`;

  return `
${systemPrompt}

${stylePrompt}

${sceneRules}

${outputSchema}

Production settings:
- title: ${options.title?.trim() || "(not provided)"}
- narrator / POV character: ${options.narratorCharacter?.trim() || "(not provided)"}
- primary on-screen character: ${options.onScreenCharacter?.trim() || "(not provided)"}
- style: ${options.style}
- color grade preset: ${options.colorGradePreset || "(not provided)"}
- scene count: ${options.sceneCount}
- main reference tag: ${options.referenceTag?.trim() || "(not provided)"}
- locked voice over provided: ${options.lockedVoiceOver?.trim() ? "YES" : "NO"}
- strict mode: ${options.strictMode ? "ON" : "OFF"}

Additional hard constraints:
- Preserve original script meaning.
- Do NOT add new facts, characters, events, diagnoses, places, or timelines not present in the source.
- Preserve the source language style and language mix; do not translate unless source already mixes languages.
- preservedVoiceOverScript must be a compression/re-phrasing of source lines, not a rewritten new script.
- If locked voice over is provided, set preservedVoiceOverScript exactly to that text with no edits.
- If scene beats are provided, each scene's voLine must map to the corresponding beat in order.
- If a beat sheet is provided, each scene must follow the corresponding beat's phase, role, importance, and voLine in order.
- If a beat sheet is provided, each scene must also follow the beat's visualRole and framingIntent, and avoid repeated portrait setups.
- Scene count must be exactly ${options.sceneCount}.
- Include a small B-roll layer: about 5 scenes should function as transition/B-roll coverage when scene count is 25 or higher.
- Scenes must follow 4 story stages in order:
  Opening - Awareness -> Understanding - Reframing -> Turning Point - Action -> Impact - Closing.
- Every scene must remain in Singapore.
- Only one clearly visible character per scene.
- Do not allow consecutive scenes to repeat the same close portrait / front-facing composition.
- If narratorCharacter and onScreenCharacter are both provided and they are different people, prioritize onScreenCharacter as the visual subject in most scenes.
- In that case, narratorCharacter should appear mainly through POV, over-shoulder, back view, silhouette, or off-screen presence.
- Do not default to the narrator as the visual subject just because the narration is from their perspective.
- Only use useReferenceImage=true when the user explicitly provided a reference tag.
- If no reference tag is provided, set useReferenceImage=false for all scenes and write characterReferenceGuidance to say no reference workflow is active.
- Keep prompts concise and practical for Kling -> select frame -> image-to-video workflow.

${options.extraInstruction ? `Correction instruction:\n${options.extraInstruction}\n` : ""}

${lockedVoiceOverBlock}
${sceneBeatBlock}
${beatSheetBlock}

${sourceBlock}
`;
}
