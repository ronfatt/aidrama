import { outputSchema } from "@/lib/prompts/outputSchema";
import { sceneRules } from "@/lib/prompts/sceneRules";
import { stylePrompt } from "@/lib/prompts/stylePrompt";
import { systemPrompt } from "@/lib/prompts/systemPrompt";

interface PromptOptions {
  title?: string;
  referenceTag?: string;
  lockedVoiceOver?: string;
  sceneCount: 20 | 22 | 25;
  style: "cinematic documentary" | "psychological drama" | "NGO educational" | "emotional realism";
  strictMode: boolean;
  sceneBeats?: string[];
  extraInstruction?: string;
}

export function buildPrompt(script: string, options: PromptOptions) {
  return `
${systemPrompt}

${stylePrompt}

${sceneRules}

${outputSchema}

Production settings:
- title: ${options.title?.trim() || "(not provided)"}
- style: ${options.style}
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
- Scene count must be exactly ${options.sceneCount}.
- Scenes must follow 4 story stages in order:
  Opening - Awareness -> Understanding - Reframing -> Turning Point - Action -> Impact - Closing.
- Every scene must remain in Singapore.
- Only one clearly visible character per scene.
- If main character appears, useReferenceImage=true.
- Keep prompts concise and practical for Kling -> select frame -> image-to-video workflow.

${options.extraInstruction ? `Correction instruction:\n${options.extraInstruction}\n` : ""}

${options.lockedVoiceOver?.trim() ? `Locked voice over (must be used exactly):\n${options.lockedVoiceOver.trim()}\n` : ""}
${options.sceneBeats?.length ? `Scene beat map (must cover all beats in order):\n${options.sceneBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n")}\n` : ""}

Script to convert:

${script.trim()}
`;
}
