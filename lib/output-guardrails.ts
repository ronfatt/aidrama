import type { FilmPack, SceneItem, ScenePhase } from "@/types/film-pack";
import { ALLOWED_SCENE_TYPES, IMAGE_PROMPT_SUFFIX, ALLOWED_SCENE_PHASES } from "@/lib/prompts/sceneRules";

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

type NormalizableScene = Omit<SceneItem, "shotType" | "phase"> & { shotType: string; phase?: string };
type NormalizableFilmPack = Omit<FilmPack, "scenes"> & { scenes: NormalizableScene[] };

const PHASE_MAP: Record<string, ScenePhase> = {
  "opening - awareness": "Opening - Awareness",
  opening: "Opening - Awareness",
  awareness: "Opening - Awareness",
  "understanding - reframing": "Understanding - Reframing",
  understanding: "Understanding - Reframing",
  reframing: "Understanding - Reframing",
  "turning point - action": "Turning Point - Action",
  "turning point": "Turning Point - Action",
  action: "Turning Point - Action",
  "impact - closing": "Impact - Closing",
  impact: "Impact - Closing",
  closing: "Impact - Closing",
};

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

function phaseByPosition(index: number, total: number): ScenePhase {
  const ratio = total <= 1 ? 1 : index / (total - 1);
  if (ratio < 0.25) return "Opening - Awareness";
  if (ratio < 0.5) return "Understanding - Reframing";
  if (ratio < 0.75) return "Turning Point - Action";
  return "Impact - Closing";
}

function normalizePhase(input: string | undefined, index: number, total: number): ScenePhase {
  const normalized = normalizeWhitespace(input || "").toLowerCase();
  if (normalized) {
    if ((ALLOWED_SCENE_PHASES as readonly string[]).includes(input || "")) {
      return input as ScenePhase;
    }
    if (PHASE_MAP[normalized]) {
      return PHASE_MAP[normalized];
    }
  }
  return phaseByPosition(index, total);
}

function normalizeScene(
  scene: NormalizableScene,
  strictMode: boolean,
  index: number,
  total: number
): SceneItem {
  return {
    ...scene,
    phase: normalizePhase(scene.phase, index, total),
    shotType: normalizeShotType(scene.shotType),
    imagePrompt: makeConciseCinematicPrompt(scene.imagePrompt, "image", strictMode),
    videoPrompt: makeConciseCinematicPrompt(scene.videoPrompt, "video", strictMode),
  };
}

export function enforceFilmPackGuardrails(
  pack: NormalizableFilmPack,
  options?: GuardrailOptions
): FilmPack {
  const strictMode = options?.strictMode ?? true;
  const settingNote = SINGAPORE_PATTERN.test(pack.settingNote)
    ? normalizeWhitespace(pack.settingNote)
    : `Singapore-based visual plan: ${normalizeWhitespace(pack.settingNote)}`;

  return {
    ...pack,
    settingNote,
    scenes: pack.scenes.map((scene, index) => normalizeScene(scene, strictMode, index, pack.scenes.length)),
  };
}
