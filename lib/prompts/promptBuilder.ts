import { outputSchema } from "@/lib/prompts/outputSchema";
import { sceneRules } from "@/lib/prompts/sceneRules";
import { stylePrompt } from "@/lib/prompts/stylePrompt";
import { systemPrompt } from "@/lib/prompts/systemPrompt";

interface PromptOptions {
  title?: string;
  referenceTag?: string;
  sceneCount: 20 | 22 | 25;
  style: "cinematic documentary" | "psychological drama" | "NGO educational" | "emotional realism";
  strictMode: boolean;
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
- strict mode: ${options.strictMode ? "ON" : "OFF"}

Additional hard constraints:
- Preserve original script meaning.
- Do NOT add new facts, characters, events, diagnoses, places, or timelines not present in the source.
- Preserve the source language style and language mix; do not translate unless source already mixes languages.
- preservedVoiceOverScript must be a compression/re-phrasing of source lines, not a rewritten new script.
- Scene count must be exactly ${options.sceneCount}.
- Every scene must remain in Singapore.
- Only one clearly visible character per scene.
- If main character appears, useReferenceImage=true.
- Keep prompts concise and practical for Kling -> select frame -> image-to-video workflow.

${options.extraInstruction ? `Correction instruction:\n${options.extraInstruction}\n` : ""}

Script to convert:

${script.trim()}
`;
}
