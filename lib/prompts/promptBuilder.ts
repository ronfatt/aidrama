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
- Scene count must be exactly ${options.sceneCount}.
- Every scene must remain in Singapore.
- Only one clearly visible character per scene.
- If main character appears, useReferenceImage=true.
- Keep prompts concise and practical for Kling -> select frame -> image-to-video workflow.

Script to convert:

${script.trim()}
`;
}
