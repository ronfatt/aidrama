import type { FilmPack, SceneItem } from "@/types/film-pack";
import { ALLOWED_SCENE_TYPES, IMAGE_PROMPT_SUFFIX } from "@/lib/prompts/sceneRules";

const SINGAPORE_PATTERN =
  /(singapore|hdb|void deck|mrt|hawker|toa payoh|tampines|ang mo kio|jurong|bishan|bedok|punggol|yishun)/i;

const SINGLE_CHARACTER_PATTERN =
  /(one clearly visible character|single character|solo subject|lone subject|single visible subject)/i;

const MULTI_CHARACTER_PATTERN =
  /(two-shot|two shot|pair|duo|group shot|two people|both faces|face-to-face conversation|double portrait)/gi;

const SHOT_TYPE_MAP: Record<string, (typeof ALLOWED_SCENE_TYPES)[number]> = {
  environment: "environment",
  "character close-up": "character close-up",
  closeup: "character close-up",
  "close-up": "character close-up",
  "behavior shot": "behavior shot",
  behavior: "behavior shot",
  "symbolic insert": "symbolic insert",
  symbolic: "symbolic insert",
  "pov shot": "POV shot",
  pov: "POV shot",
  "over-shoulder shot": "over-shoulder shot",
  "over shoulder": "over-shoulder shot",
  "over-the-shoulder": "over-shoulder shot",
};

interface GuardrailOptions {
  strictMode?: boolean;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function truncateWords(input: string, maxWords: number): string {
  const words = input.split(" ");
  if (words.length <= maxWords) return input;
  return `${words.slice(0, maxWords).join(" ")}.`;
}

function enforceSingleCharacterLanguage(input: string): string {
  const cleaned = input.replace(MULTI_CHARACTER_PATTERN, "single-subject frame");
  if (SINGLE_CHARACTER_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}, one clearly visible character`;
}

function enforceSingaporeLanguage(input: string): string {
  if (SINGAPORE_PATTERN.test(input)) {
    return input;
  }
  return `Singapore HDB setting, ${input}`;
}

function makeConciseCinematicPrompt(
  input: string,
  mode: "image" | "video",
  strictMode: boolean
): string {
  let prompt = normalizeWhitespace(input)
    .replace(/^image prompt:\s*/i, "")
    .replace(/^video prompt:\s*/i, "");

  prompt = enforceSingaporeLanguage(prompt);
  prompt = enforceSingleCharacterLanguage(prompt);

  if (!/cinematic|35mm|photoreal|documentary realism/i.test(prompt)) {
    prompt = `cinematic photoreal 35mm frame, ${prompt}`;
  }

  if (mode === "video" && !/subtle motion|ambient motion|camera/i.test(prompt)) {
    prompt = `${prompt}, subtle motion, ambient movement, controlled camera move`;
  }

  if (mode === "image" && strictMode) {
    const compact = truncateWords(normalizeWhitespace(prompt), 24).replace(/[,. ]+$/g, "");
    return `${compact}, ${IMAGE_PROMPT_SUFFIX}`;
  }

  const maxWords = strictMode ? 40 : 56;
  return truncateWords(normalizeWhitespace(prompt), maxWords);
}

function normalizeShotType(input: string): (typeof ALLOWED_SCENE_TYPES)[number] {
  const normalized = normalizeWhitespace(input).toLowerCase();
  return SHOT_TYPE_MAP[normalized] ?? "behavior shot";
}

function normalizeScene(scene: SceneItem, strictMode: boolean): SceneItem {
  return {
    ...scene,
    shotType: normalizeShotType(scene.shotType),
    imagePrompt: makeConciseCinematicPrompt(scene.imagePrompt, "image", strictMode),
    videoPrompt: makeConciseCinematicPrompt(scene.videoPrompt, "video", strictMode),
  };
}

export function enforceFilmPackGuardrails(pack: FilmPack, options?: GuardrailOptions): FilmPack {
  const strictMode = options?.strictMode ?? true;
  const settingNote = SINGAPORE_PATTERN.test(pack.settingNote)
    ? normalizeWhitespace(pack.settingNote)
    : `Singapore-based visual plan: ${normalizeWhitespace(pack.settingNote)}`;

  return {
    ...pack,
    settingNote,
    scenes: pack.scenes.map((scene) => normalizeScene(scene, strictMode)),
  };
}
