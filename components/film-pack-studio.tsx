"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { RulesPanel } from "@/components/rules-panel";
import { SceneCard } from "@/components/scene-card";
import {
  CAST_ROLES,
  COLOR_GRADE_PRESETS,
  DEFAULT_REFERENCE_TAG,
  FANTASY_COLOR_GRADE_PRESETS,
  FANTASY_FILM_STYLES,
  FANTASY_SAMPLE_BIBLE,
  FANTASY_SAMPLE_SCRIPT,
  FANTASY_SAMPLE_VO,
  FILM_STYLES,
  PROJECT_MODES,
  SAMPLE_SCRIPT,
  SCENE_COUNTS,
  TAWAU_SAMPLE_SCRIPT,
  TAWAU_SAMPLE_VO,
} from "@/lib/constants";
import { assembleFilmPackFromScenes } from "@/lib/film-pack-assembly";
import { fullOutputCopy, toFilmPackMarkdown, toFilmPackText } from "@/lib/formatters";
import { pickKlingMotionTemplate } from "@/lib/kling-motion";
import { normalizeReferenceTag } from "@/lib/reference-tag";
import type {
  AspectRatio,
  BeatItem,
  CastMemberInput,
  ColorGradePreset,
  CompanionShot,
  DirectorSceneType,
  EpisodeHeaderInput,
  FantasyBibleInput,
  FilmPack,
  FilmTone,
  ProjectMode,
  SceneMetadata,
  SceneType,
  SceneCountInput,
  SceneItem,
} from "@/types/film-pack";

interface GenerateBeatSheetResponse {
  beatSheet: BeatItem[];
  sceneCount: number;
}

interface GenerateScenePayload {
  scenes?: SceneMetadata[] | SceneItem[];
  error?: string;
}

interface GenerateCompanionShotPayload {
  shot?: CompanionShot;
  error?: string;
}

interface GenerateShotPackPayload {
  shots?: CompanionShot[];
  error?: string;
}

interface GenerateImageResponse {
  imageDataUrl?: string;
  error?: string;
  taskId?: string;
  status?: "submitted" | "processing" | "succeeded" | "failed";
  provider?: "gemini" | "kling";
  fallbackFrom?: "gemini" | "kling";
  modelUsed?: string;
}

interface SavedFilmPackRecord {
  id: string;
  title: string;
  style: FilmTone;
  sceneCount: number;
  createdAt: string;
  projectMode?: ProjectMode;
  filmPack: FilmPack;
}

interface CharacterMasterShot {
  id: string;
  label: string;
  purpose: string;
  framing: string;
  imagePrompt: string;
  lightingColor: string;
}

const STORAGE_KEY = "film-pack-studio:saved-packs";

function createCastMember(): CastMemberInput {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "supporting",
    referenceTag: "",
    identityNote: "",
    wardrobeNote: "",
    relationshipNote: "",
    masterReferenceImages: [],
    masterReferenceUrls: "",
    officialMasterReference: null,
  };
}

function parseEpisodeIndex(value?: string) {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function incrementEpisodeLabel(value?: string) {
  const currentIndex = parseEpisodeIndex(value);
  if (currentIndex) {
    if (!value) return `Episode ${currentIndex + 1}`;
    return value.replace(/\d+/, String(currentIndex + 1));
  }
  return value?.trim() ? `${value.trim()} 2` : "Episode 2";
}

function extractPreviouslyOnSummary(pack: FilmPack) {
  const episodeTitle = pack.episodeHeader?.episodeTitle?.trim();
  const episodeGoal = pack.episodeHeader?.episodeGoal?.trim();
  const cliffhanger = pack.episodeHeader?.cliffhanger?.trim();
  const voSummary = pack.preservedVoiceOverScript
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  const parts = [
    episodeTitle ? `${episodeTitle}` : "",
    episodeGoal || "",
    cliffhanger ? `It ended with ${cliffhanger}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(". ");
  }

  return voSummary || "";
}

function extractContinuitySeed(pack: FilmPack) {
  const parts = [
    pack.episodeHeader?.continuityLog?.trim() || "",
    pack.episodeHeader?.cliffhanger?.trim() ? `Carry forward: ${pack.episodeHeader?.cliffhanger?.trim()}` : "",
  ].filter(Boolean);

  return parts.join(". ");
}

function extractCurrentEpisodeSeed(args: {
  title: string;
  episodeHeader: EpisodeHeaderInput;
  preservedVoiceOverScript?: string;
  lockedVoiceOver?: string;
  originalScript?: string;
}) {
  const parts = [
    args.episodeHeader.episodeTitle?.trim() || args.title.trim(),
    args.episodeHeader.episodeGoal?.trim() || "",
    args.episodeHeader.cliffhanger?.trim() ? `It ended with ${args.episodeHeader.cliffhanger.trim()}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(". ");
  }

  const fallbackText =
    args.preservedVoiceOverScript?.trim() ||
    args.lockedVoiceOver?.replace(/\s+/g, " ").trim() ||
    args.originalScript?.replace(/\s+/g, " ").trim() ||
    "";

  return fallbackText.slice(0, 220);
}

function serializeCastBibleForRequest(castBible: CastMemberInput[]) {
  return castBible
    .filter((character) => character.name.trim())
    .map((character) => ({
      id: character.id,
      name: character.name.trim(),
      role: character.role,
      referenceTag: normalizeReferenceTag(character.referenceTag || ""),
      identityNote: character.identityNote?.trim() || "",
      wardrobeNote: character.wardrobeNote?.trim() || "",
      relationshipNote: character.relationshipNote?.trim() || "",
      hasOfficialRef: Boolean(character.officialMasterReference),
    }));
}

function restoreCastBibleInputs(
  castBible?: Array<
    Pick<CastMemberInput, "name" | "role" | "referenceTag" | "identityNote" | "wardrobeNote" | "relationshipNote">
  >
) {
  return (castBible || []).map((character) => ({
    ...createCastMember(),
    name: character.name || "",
    role: character.role || "supporting",
    referenceTag: normalizeReferenceTag(character.referenceTag || ""),
    identityNote: character.identityNote || "",
    wardrobeNote: character.wardrobeNote || "",
    relationshipNote: character.relationshipNote || "",
  }));
}

function parseCharacterReferenceUrls(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));
}

function getCharacterReferenceCandidates(character: CastMemberInput) {
  return [...(character.masterReferenceImages || []), ...parseCharacterReferenceUrls(character.masterReferenceUrls || "")];
}

function getEffectiveCharacterReferences(character: CastMemberInput) {
  const candidates = getCharacterReferenceCandidates(character);
  if (character.officialMasterReference) {
    return [character.officialMasterReference];
  }
  return candidates;
}

function getCharacterWorldContext(projectMode: ProjectMode) {
  if (projectMode === "coastal-fantasy-drama") {
    return "Southeast Asian coastal fantasy world, grounded realism, no western default hero styling";
  }
  if (projectMode === "tawau-sabah-realism") {
    return "modern Tawau Sabah civic and town context, contemporary Malaysian realism";
  }
  return "contemporary Singapore realism";
}

function buildCharacterMasterSheet(
  character: CastMemberInput,
  projectMode: ProjectMode,
  colorGradePreset: ColorGradePreset
): CharacterMasterShot[] {
  const name = character.name.trim() || "Character";
  const tag = normalizeReferenceTag(character.referenceTag || "");
  const identity = character.identityNote?.trim() || "grounded Southeast Asian face identity";
  const wardrobe = character.wardrobeNote?.trim() || "consistent wardrobe baseline, simple clean styling";
  const worldContext = getCharacterWorldContext(projectMode);
  const baseLocks = [
    `${name} ${tag}`.trim(),
    identity,
    wardrobe,
    worldContext,
    "neutral identity reference image, not a dramatic scene frame",
    "same exact person across all reference angles",
    "avoid extreme emotion, avoid rain, avoid action blur, avoid heavy stylization",
    "clean facial readability, realistic skin texture, grounded contemporary styling",
  ].join(", ");

  return [
    {
      id: `${character.id}-master-front`,
      label: "Front Portrait",
      purpose: "Primary identity anchor for face structure and expression neutrality.",
      framing: "front neutral portrait",
      imagePrompt: `${baseLocks}, front-facing portrait, calm neutral expression, direct or near-direct gaze, natural balanced daylight, simple uncluttered background, clear jawline, hairline, facial hair and eye shape readable, vertical character reference frame`,
      lightingColor: `${colorGradePreset}, neutral clean daylight, soft contrast`,
    },
    {
      id: `${character.id}-master-three-quarter`,
      label: "Three-Quarter Portrait",
      purpose: "Secondary angle for identity continuity in cinematic close-ups.",
      framing: "45-degree portrait",
      imagePrompt: `${baseLocks}, three-quarter portrait at 45 degrees, calm focused expression, natural daylight, subtle depth but face fully readable, uncluttered background, vertical character reference frame`,
      lightingColor: `${colorGradePreset}, neutral natural side light, soft contrast`,
    },
    {
      id: `${character.id}-master-profile`,
      label: "Side Profile",
      purpose: "Profile reference for silhouette, nose line, hairline and ear shape continuity.",
      framing: "clean side profile",
      imagePrompt: `${baseLocks}, clean side profile portrait, neutral expression, profile clearly visible, soft daylight from one side, plain background, emphasis on silhouette accuracy, vertical character reference frame`,
      lightingColor: `${colorGradePreset}, profile daylight, restrained contrast`,
    },
    {
      id: `${character.id}-master-half-body`,
      label: "Half-Body Standing",
      purpose: "Wardrobe and posture anchor for medium shots and scene continuity.",
      framing: "half-body standing reference",
      imagePrompt: `${baseLocks}, half-body standing portrait, relaxed natural posture, hands simple and visible, wardrobe clearly readable, neutral expression, natural daylight, clean background, vertical character reference frame`,
      lightingColor: `${colorGradePreset}, soft daylight with realistic skin tones`,
    },
  ];
}

function getColorGradeLock(preset: ColorGradePreset, style: FilmTone): string {
  switch (preset) {
    case "storm-blue mythic":
      return "storm-blue mythic grade, steel-blue shadows, sea-storm atmosphere, restrained cyan energy, luminous highlights, no warm domestic flattening";
    case "moonlit coastal tension":
      return "moonlit coastal tension grade, silver-blue moonlight, wet reflections, deep marine shadows, controlled contrast, no warm sitcom softness";
    case "sunset awakening":
      return "sunset awakening grade, ember-gold horizon light, teal-blue sea contrast, charged atmosphere, radiant highlights, no flat neutral wash";
    case "tidal supernatural realism":
      return "tidal supernatural realism grade, grounded oceanic neutrals, saline gray-blue depth, realistic skin tones, subtle supernatural glow in water interaction";
    case "neutral-cool restraint":
      return "restrained neutral-cool grade, soft cyan-gray shadows, muted practical warmth, no orange-teal swing";
    case "muted realism":
      return "muted neutral grade, softened saturation, gentle contrast, realistic blacks, no strong warm-cool split";
    case "soft warm intimacy":
      return "soft warm intimacy grade, gentle amber practicals, natural skin tones, warm-neutral shadows, no cold cyan cast";
    case "warm-neutral documentary":
    default:
      if (style === "psychological drama") {
        return "grounded warm-neutral base with restrained cool shadows, consistent practical warmth, no abrupt temperature swing";
      }
      return "grounded warm-neutral documentary grade, controlled cool dusk only in backgrounds, consistent practical warmth, no harsh cyan shift";
  }
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function resizeImageFile(file: File, maxWidth = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Failed to load image for resize."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chunkScenes<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeStageError(raw: string, fallback: string): string {
  if (!raw) return fallback;
  if (raw.includes("FUNCTION_INVOCATION_TIMEOUT")) return "Vercel function timeout.";
  if (raw.trim() === "terminated") return "The server process terminated mid-generation. Please retry.";
  return raw;
}

function fallbackShotTypeFromBeat(beat: BeatItem): SceneType {
  const grammar = beat.shotGrammarPreset.toLowerCase();
  const visualRole = beat.visualRole.toLowerCase();
  const framingIntent = beat.framingIntent.toLowerCase();

  if (beat.role === "transition") return "transition B-roll";
  if (beat.role === "broll") {
    if (grammar.includes("insert") || visualRole.includes("object")) return "symbolic insert";
    return "atmospheric insert";
  }
  if (framingIntent.includes("over-shoulder") || visualRole.includes("over-shoulder")) return "over-shoulder shot";
  if (framingIntent.includes("close") || visualRole.includes("portrait")) return "character close-up";
  if (framingIntent.includes("distance") || visualRole.includes("wide")) return "environment";
  if (grammar.includes("omen") || grammar.includes("silhouette") || framingIntent.includes("reflection")) {
    return "symbolic insert";
  }
  return "behavior shot";
}

function fallbackCameraFromBeat(beat: BeatItem): string {
  const grammar = beat.shotGrammarPreset.toLowerCase();
  const framingIntent = beat.framingIntent.toLowerCase();
  if (beat.role === "transition") return "slow drifting transitional move";
  if (beat.role === "broll") return "measured observational glide";
  if (grammar.includes("power reveal")) return "subtle push-in as tension builds";
  if (grammar.includes("enemy reveal") || grammar.includes("threat")) return "slow creeping advance with held tension";
  if (framingIntent.includes("close")) return "controlled close push-in";
  if (framingIntent.includes("distance") || framingIntent.includes("wide")) return "slow wide hold with minimal drift";
  if (framingIntent.includes("over-shoulder")) return "steady over-shoulder hold";
  return "controlled cinematic hold";
}

function fallbackLightingFromBeat(
  beat: BeatItem,
  mode: ProjectMode,
  preset: ColorGradePreset,
  tone: FilmTone
): string {
  if (mode === "coastal-fantasy-drama") {
    switch (preset) {
      case "storm-blue mythic":
        return "storm-blue mythic grade, sea-cooled shadows, controlled highlight contrast";
      case "moonlit coastal tension":
        return "moonlit coastal tension, silver-blue reflections, wet shadow detail";
      case "sunset awakening":
        return "sunset awakening tones, ember-gold edge light, teal sea contrast";
      case "tidal supernatural realism":
        return "tidal supernatural realism, grounded marine neutrals, subtle water glow";
      default:
        return "oceanic fantasy realism, controlled cool shadows, practical highlights";
    }
  }

  if (preset === "neutral-cool restraint") {
    return "neutral-cool restraint, soft cyan-gray shadows, muted practical warmth";
  }
  if (preset === "muted realism") {
    return "muted realism, softened saturation, gentle neutral contrast";
  }
  if (preset === "soft warm intimacy") {
    return "soft warm intimacy, amber practical light, gentle warm-neutral shadows";
  }
  if (tone === "psychological drama") {
    return "grounded warm-neutral base with restrained cool shadows, consistent practical warmth";
  }
  return "warm-neutral documentary light, natural practical warmth, grounded contrast";
}

function fallbackSceneMetadataFromBeat(
  beat: BeatItem,
  mode: ProjectMode,
  preset: ColorGradePreset,
  tone: FilmTone,
  normalizedReferenceTag: string,
  primaryOnScreenCharacter?: string
): SceneMetadata {
  const baseScene: SceneMetadata = {
    sceneNumber: beat.beatNumber,
    phase: beat.phase,
    voLine: beat.voLine,
    onScreenCharacter: primaryOnScreenCharacter || "",
    impliedOtherCharacter: "",
    shotType: fallbackShotTypeFromBeat(beat),
    shotGrammarPreset: beat.shotGrammarPreset,
    scenePurpose: beat.purpose,
    importance: beat.importance,
    useReferenceImage: Boolean(normalizedReferenceTag) && beat.role === "hero",
    camera: fallbackCameraFromBeat(beat),
    lightingColor: fallbackLightingFromBeat(beat, mode, preset, tone),
  };
  const motionTemplate = pickKlingMotionTemplate({
    scene: baseScene,
    projectMode: mode,
    style: tone,
  });
  return {
    ...baseScene,
    cameraStyle: motionTemplate.cameraStyle,
    actionStyle: motionTemplate.actionStyle,
    motionTemplateId: motionTemplate.id,
  };
}

function applySceneTypeOverride(scene: SceneItem, nextType: DirectorSceneType): SceneItem {
  const dialogueFallback = {
    voiceScript: scene.voiceScript || scene.voLine,
    lipSyncPrompt:
      scene.lipSyncPrompt ||
      `${scene.cameraStyle || "cinematic close-up"}, character speaking naturally, synced delivery, restrained mouth movement`,
    microActingPrompt:
      scene.microActingPrompt ||
      "subtle head nods, natural blinking, controlled breathing, small pauses, attentive eye focus",
    reactionShotPrompt:
      scene.reactionShotPrompt ||
      "brief reaction shot of listener or nearby witness, then return to speaker",
  };

  const actionFallback = {
    actionSequence:
      scene.actionSequence ||
      "first the tension rises, then the character commits to movement, finally the impact resolves into a reset beat",
    impactBeat:
      scene.impactBeat ||
      "the key impact lands with controlled force, motion, and environmental reaction",
    enemyResponse:
      scene.enemyResponse || "the opposing force reacts, recoils, or escalates within the same moment",
    aftermathShot:
      scene.aftermathShot || "brief aftermath frame showing recoil, debris, breath, or charged stillness",
  };

  const environmentFallback = {
    establishingBeat:
      scene.establishingBeat || `establish the location as ${scene.scenePurpose.toLowerCase()}`,
    cutawayPrompt:
      scene.cutawayPrompt || "insert a supporting location detail, signage, texture, or environmental movement",
    atmosphereNote:
      scene.atmosphereNote || `${scene.lightingColor}, ambient space activity, subtle lived-in environmental motion`,
    transitionBeat:
      scene.transitionBeat || "use the location to bridge smoothly into the next scene beat",
  };

  const emotionalFallback = {
    microTensionPrompt:
      scene.microTensionPrompt ||
      "controlled breathing, restrained posture, tiny jaw or hand tension, emotion held beneath the surface",
    silenceBeat:
      scene.silenceBeat || `hold on a quiet pause after "${scene.voLine}" so the feeling lands`,
    eyeLineShiftPrompt:
      scene.eyeLineShiftPrompt ||
      "small eye-line change away from camera or into negative space to suggest inner processing",
    pullAwayShot:
      scene.pullAwayShot || "after the emotion lands, slowly pull away or widen into reflective space",
  };

  return {
    ...scene,
    sceneType: nextType,
    ...dialogueFallback,
    ...actionFallback,
    ...environmentFallback,
    ...emotionalFallback,
  };
}

export function FilmPackStudio() {
  const [projectMode, setProjectMode] = useState<ProjectMode>("singapore-realism");
  const [title, setTitle] = useState("Community in Motion");
  const [originalScript, setOriginalScript] = useState(SAMPLE_SCRIPT);
  const [lockedVoiceOver, setLockedVoiceOver] = useState("");
  const [narratorCharacter, setNarratorCharacter] = useState("");
  const [onScreenCharacter, setOnScreenCharacter] = useState("");
  const [referenceTag, setReferenceTag] = useState(DEFAULT_REFERENCE_TAG);
  const [sceneCount, setSceneCount] = useState<SceneCountInput>("auto");
  const [style, setStyle] = useState<FilmTone>("cinematic documentary");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [colorGradePreset, setColorGradePreset] = useState<ColorGradePreset>("warm-neutral documentary");
  const [strictMode, setStrictMode] = useState(true);
  const [episodeHeader, setEpisodeHeader] = useState<EpisodeHeaderInput>({
    seasonLabel: "",
    episodeNumber: "",
    episodeTitle: "",
    episodeGoal: "",
    previouslyOn: "",
    continuityLog: "",
    cliffhanger: "",
  });
  const [fantasyBible, setFantasyBible] = useState<FantasyBibleInput>({
    corePremise: "",
    heroName: "",
    powerType: "",
    powerLimits: "",
    enemyType: "",
    worldTone: "",
    endingHook: "",
  });
  const [castBible, setCastBible] = useState<CastMemberInput[]>([]);
  const [masterReferenceImages, setMasterReferenceImages] = useState<string[]>([]);
  const [masterReferenceUrls, setMasterReferenceUrls] = useState("");
  const [officialMasterReference, setOfficialMasterReference] = useState<string | null>(null);
  const [characterMasterSheets, setCharacterMasterSheets] = useState<Record<string, CharacterMasterShot[]>>({});
  const [characterMasterImageUrls, setCharacterMasterImageUrls] = useState<Record<string, string>>({});
  const [characterMasterImageMeta, setCharacterMasterImageMeta] = useState<Record<string, string>>({});
  const [characterMasterImageLoading, setCharacterMasterImageLoading] = useState<Record<string, boolean>>({});
  const [characterMasterImageErrors, setCharacterMasterImageErrors] = useState<Record<string, string>>({});
  const [characterMasterBatchLoading, setCharacterMasterBatchLoading] = useState<Record<string, boolean>>({});
  const [beatSheet, setBeatSheet] = useState<BeatItem[]>([]);
  const [beatSceneCount, setBeatSceneCount] = useState<number | null>(null);
  const [beatLoading, setBeatLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FilmPack | null>(null);
  const [sceneImages, setSceneImages] = useState<Record<number, string>>({});
  const [companionImages, setCompanionImages] = useState<Record<string, string>>({});
  const [sceneImageMeta, setSceneImageMeta] = useState<Record<number, string>>({});
  const [companionImageMeta, setCompanionImageMeta] = useState<Record<string, string>>({});
  const [sceneImageLoading, setSceneImageLoading] = useState<Record<number, boolean>>({});
  const [companionImageLoading, setCompanionImageLoading] = useState<Record<string, boolean>>({});
  const [sceneImageErrors, setSceneImageErrors] = useState<Record<number, string>>({});
  const [companionImageErrors, setCompanionImageErrors] = useState<Record<string, string>>({});
  const [companionLoading, setCompanionLoading] = useState<Record<number, "broll" | "transition" | null>>({});
  const [scenePromptRegenerating, setScenePromptRegenerating] = useState<Record<number, boolean>>({});
  const [shotPackLoading, setShotPackLoading] = useState<Record<number, boolean>>({});
  const [companionBatchImageLoading, setCompanionBatchImageLoading] = useState<Record<number, boolean>>({});
  const [savedPacks, setSavedPacks] = useState<SavedFilmPackRecord[]>([]);
  const availableFilmStyles = useMemo(
    () => (projectMode === "coastal-fantasy-drama" ? FANTASY_FILM_STYLES : FILM_STYLES),
    [projectMode]
  );
  const availableColorPresets = useMemo(
    () => (projectMode === "coastal-fantasy-drama" ? FANTASY_COLOR_GRADE_PRESETS : COLOR_GRADE_PRESETS),
    [projectMode]
  );

  const fullCopy = useMemo(() => (result ? fullOutputCopy(result) : ""), [result]);
  const referenceSceneCount = useMemo(
    () => (result ? result.scenes.filter((scene) => scene.useReferenceImage).length : 0),
    [result]
  );
  const projectColorGradeLock = useMemo(() => {
    const leadSceneLighting = result?.scenes?.[0]?.lightingColor?.trim();
    if (leadSceneLighting) {
      return `${getColorGradeLock(colorGradePreset, style)}; anchor to lead scene lighting: ${leadSceneLighting}`;
    }
    return getColorGradeLock(colorGradePreset, style);
  }, [colorGradePreset, result, style]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedFilmPackRecord[];
      if (Array.isArray(parsed)) {
        setSavedPacks(parsed);
      }
    } catch {
      setSavedPacks([]);
    }
  }, []);

  useEffect(() => {
    const nextDefault =
      projectMode === "coastal-fantasy-drama" ? "storm-blue mythic" : "warm-neutral documentary";

    if (!availableColorPresets.includes(colorGradePreset)) {
      setColorGradePreset(nextDefault);
    }
  }, [availableColorPresets, colorGradePreset, projectMode]);

  useEffect(() => {
    const nextDefault = projectMode === "coastal-fantasy-drama" ? "epic cinematic fantasy" : "cinematic documentary";

    if (!availableFilmStyles.includes(style)) {
      setStyle(nextDefault);
    }
  }, [availableFilmStyles, projectMode, style]);

  const persistSavedPacks = (records: SavedFilmPackRecord[]) => {
    setSavedPacks(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  };

  const saveCurrentPack = () => {
    if (!result) return;
    const record: SavedFilmPackRecord = {
      id: crypto.randomUUID(),
      title: result.title,
      style: result.style,
      sceneCount: result.scenes.length,
      createdAt: new Date().toISOString(),
      projectMode,
      filmPack: result,
    };
    persistSavedPacks([record, ...savedPacks].slice(0, 50));
  };

  const openSavedPack = (id: string) => {
    const target = savedPacks.find((record) => record.id === id);
    if (target) {
      setResult(target.filmPack);
      if (target.filmPack.aspectRatio) {
        setAspectRatio(target.filmPack.aspectRatio);
      }
      if (target.filmPack.colorGradePreset) {
        setColorGradePreset(target.filmPack.colorGradePreset);
      }
      setEpisodeHeader(
        target.filmPack.episodeHeader || {
          seasonLabel: "",
          episodeNumber: "",
          episodeTitle: "",
          episodeGoal: "",
          previouslyOn: "",
          continuityLog: "",
          cliffhanger: "",
        }
      );
      setCastBible(restoreCastBibleInputs(target.filmPack.castBible));
      setBeatSheet(target.filmPack.beatSheet || []);
      setBeatSceneCount(target.filmPack.beatSheet?.length || target.filmPack.scenes.length);
      setSceneImages({});
      setCompanionImages({});
      setSceneImageLoading({});
      setCompanionImageLoading({});
      setSceneImageErrors({});
      setCompanionImageErrors({});
      setCompanionLoading({});
    }
  };

  const deleteSavedPack = (id: string) => {
    persistSavedPacks(savedPacks.filter((record) => record.id !== id));
  };

  const previousEpisodeSource = useMemo(() => {
    const currentEpisodeIndex = parseEpisodeIndex(episodeHeader.episodeNumber);
    const currentSeason = (episodeHeader.seasonLabel || "").trim().toLowerCase();

    const eligible = savedPacks.filter((record) => {
      const sameMode = !record.projectMode || record.projectMode === projectMode;
      const recordSeason = (record.filmPack.episodeHeader?.seasonLabel || "").trim().toLowerCase();
      if (!sameMode) return false;
      if (currentSeason && recordSeason && currentSeason !== recordSeason) return false;
      return Boolean(record.filmPack.episodeHeader);
    });

    if (currentEpisodeIndex && currentEpisodeIndex > 1) {
      const previousIndex = currentEpisodeIndex - 1;
      const exact = eligible.find((record) => {
        const recordEpisodeIndex = parseEpisodeIndex(record.filmPack.episodeHeader?.episodeNumber);
        return recordEpisodeIndex === previousIndex;
      });
      if (exact) return exact;
    }

    return eligible[0] || null;
  }, [episodeHeader.episodeNumber, episodeHeader.seasonLabel, projectMode, savedPacks]);

  const applyPreviousEpisodeContext = () => {
    if (!previousEpisodeSource) return;
    const previousPack = previousEpisodeSource.filmPack;
    const previousSummary = extractPreviouslyOnSummary(previousPack);
    const continuitySeed = extractContinuitySeed(previousPack);

    setEpisodeHeader((prev) => ({
      ...prev,
      seasonLabel: prev.seasonLabel || previousPack.episodeHeader?.seasonLabel || "",
      previouslyOn: previousSummary || prev.previouslyOn || "",
      continuityLog: [continuitySeed, prev.continuityLog].filter(Boolean).join("\n\n").trim(),
      cliffhanger: prev.cliffhanger || "",
    }));
  };

  const applyPreviousCastContinuity = () => {
    if (!previousEpisodeSource?.filmPack.castBible?.length) return;

    setCastBible((prev) => {
      const previousCast = previousEpisodeSource.filmPack.castBible || [];
      const prevByName = new Map(prev.map((character) => [character.name.trim().toLowerCase(), character]));

      const merged = previousCast.map((character) => {
        const existing = prevByName.get(character.name.trim().toLowerCase());
        if (existing) {
          return {
            ...existing,
            role: character.role || existing.role,
            referenceTag: normalizeReferenceTag(character.referenceTag || existing.referenceTag || ""),
            identityNote: [character.identityNote?.trim() || "", existing.identityNote?.trim() || ""]
              .filter(Boolean)
              .join(existing.identityNote?.trim() ? "\n\n" : ""),
            wardrobeNote: [character.wardrobeNote?.trim() || "", existing.wardrobeNote?.trim() || ""]
              .filter(Boolean)
              .join(existing.wardrobeNote?.trim() ? "\n\n" : ""),
            relationshipNote: [character.relationshipNote?.trim() || "", existing.relationshipNote?.trim() || ""]
              .filter(Boolean)
              .join(existing.relationshipNote?.trim() ? "\n\n" : ""),
          };
        }

        return {
          ...createCastMember(),
          name: character.name || "",
          role: character.role || "supporting",
          referenceTag: normalizeReferenceTag(character.referenceTag || ""),
          identityNote: character.identityNote || "",
          wardrobeNote: character.wardrobeNote || "",
          relationshipNote: character.relationshipNote || "",
        };
      });

      const carriedNames = new Set(merged.map((character) => character.name.trim().toLowerCase()));
      const remainingCurrent = prev.filter((character) => !carriedNames.has(character.name.trim().toLowerCase()));

      return [...merged, ...remainingCurrent].slice(0, 8);
    });
  };

  const seedNextEpisode = () => {
    const currentSummary = extractCurrentEpisodeSeed({
      title,
      episodeHeader,
      preservedVoiceOverScript: result?.preservedVoiceOverScript,
      lockedVoiceOver,
      originalScript,
    });

    setEpisodeHeader((prev) => ({
      ...prev,
      episodeNumber: incrementEpisodeLabel(prev.episodeNumber),
      episodeTitle: "",
      episodeGoal: "",
      previouslyOn: currentSummary || prev.previouslyOn || "",
      continuityLog: [prev.continuityLog?.trim() || "", prev.cliffhanger?.trim() ? `Carry forward: ${prev.cliffhanger.trim()}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      cliffhanger: "",
    }));
  };

  const resetGeneratedState = () => {
    setBeatSheet([]);
    setBeatSceneCount(null);
    setResult(null);
    setError(null);
    setSceneImages({});
    setCompanionImages({});
    setSceneImageLoading({});
    setCompanionImageLoading({});
    setSceneImageErrors({});
    setCompanionImageErrors({});
    setCompanionLoading({});
    setScenePromptRegenerating({});
    setShotPackLoading({});
    setCompanionBatchImageLoading({});
    setSceneImageMeta({});
    setCompanionImageMeta({});
    setCharacterMasterSheets({});
    setCharacterMasterImageUrls({});
    setCharacterMasterImageMeta({});
    setCharacterMasterImageLoading({});
    setCharacterMasterImageErrors({});
    setCharacterMasterBatchLoading({});
  };

  const loadProjectModeSample = (mode: ProjectMode) => {
    resetGeneratedState();
    setProjectMode(mode);

    if (mode === "coastal-fantasy-drama") {
      setTitle("Tidebound");
      setOriginalScript(FANTASY_SAMPLE_SCRIPT);
      setLockedVoiceOver(FANTASY_SAMPLE_VO);
      setNarratorCharacter("");
      setOnScreenCharacter("Kai");
      setReferenceTag("[KAI_REF]");
      setStyle("epic cinematic fantasy");
      setAspectRatio("16:9");
      setColorGradePreset("storm-blue mythic");
      setSceneCount(30);
      setEpisodeHeader({
        seasonLabel: "Season 1",
        episodeNumber: "Episode 1",
        episodeTitle: "Tidebound Awakening",
        episodeGoal: "Introduce Kai, the sea-linked power, and the first sign that the coast is changing.",
        previouslyOn: "",
        continuityLog: "Kai still lives an ordinary coastal life. No one else fully understands his connection to the sea yet.",
        cliffhanger: "A larger force beneath the water becomes aware of him.",
      });
      setFantasyBible(FANTASY_SAMPLE_BIBLE);
      setCastBible([
        {
          ...createCastMember(),
          name: "Kai",
          role: "lead",
          referenceTag: "[KAI_REF]",
          identityNote: "lean young coastal hero, grounded Southeast Asian look, focused gaze",
          wardrobeNote: "dark coastal workwear, sea-worn layers, practical silhouette",
        },
      ]);
      return;
    }

    if (mode === "tawau-sabah-realism") {
      setTitle("Tawau AI Smart Aduan - From Complaint to Action");
      setOriginalScript(TAWAU_SAMPLE_SCRIPT);
      setLockedVoiceOver(TAWAU_SAMPLE_VO);
      setNarratorCharacter("Municipal Officer");
      setOnScreenCharacter("Local Citizen");
      setReferenceTag("[CITIZEN_REPORTER]");
      setStyle("cinematic documentary");
      setAspectRatio("16:9");
      setColorGradePreset("neutral-cool restraint");
      setSceneCount("auto");
      setEpisodeHeader({
        seasonLabel: "Season 1",
        episodeNumber: "Episode 1",
        episodeTitle: "From Complaint to Action",
        episodeGoal: "Show how a citizen report moves through Tawau's municipal system into visible action.",
        previouslyOn: "",
        continuityLog: "Public complaints are still handled manually in many places; this episode introduces the AI Smart Aduan workflow.",
        cliffhanger: "The Tawau pilot hints at a wider smart-governance rollout across Malaysia.",
      });
      setFantasyBible({
        corePremise: "",
        heroName: "",
        powerType: "",
        powerLimits: "",
        enemyType: "",
        worldTone: "",
        endingHook: "",
      });
      setCastBible([
        {
          ...createCastMember(),
          name: "Local Citizen",
          role: "lead",
          referenceTag: "[CITIZEN_REPORTER]",
          identityNote: "grounded Sabah resident, everyday civic realism",
          wardrobeNote: "clean casual public-facing clothing, contemporary local look",
        },
        {
          ...createCastMember(),
          name: "Municipal Officer",
          role: "supporting",
          referenceTag: "[MUNICIPAL_OFFICER]",
          identityNote: "professional civic staff member, composed, efficient",
          wardrobeNote: "smart office attire or official fieldwear",
        },
      ]);
      return;
    }

    setTitle("Community in Motion");
    setOriginalScript(SAMPLE_SCRIPT);
    setLockedVoiceOver("");
    setNarratorCharacter("");
    setOnScreenCharacter("");
    setReferenceTag(DEFAULT_REFERENCE_TAG);
    setStyle("cinematic documentary");
    setAspectRatio("16:9");
    setColorGradePreset("warm-neutral documentary");
    setSceneCount("auto");
    setEpisodeHeader({
      seasonLabel: "",
      episodeNumber: "",
      episodeTitle: "",
      episodeGoal: "",
      previouslyOn: "",
      continuityLog: "",
      cliffhanger: "",
    });
    setFantasyBible({
      corePremise: "",
      heroName: "",
      powerType: "",
      powerLimits: "",
      enemyType: "",
      worldTone: "",
      endingHook: "",
    });
    setCastBible([]);
  };

  const onUploadMasterRefs = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    const dataUrls = await Promise.all(files.map((file) => resizeImageFile(file)));
    setMasterReferenceImages(dataUrls.filter(Boolean));
  };

  const onUploadCastRefs = async (characterId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    const dataUrls = await Promise.all(files.map((file) => resizeImageFile(file)));
    setCastBible((prev) =>
      prev.map((character) =>
        character.id === characterId ? { ...character, masterReferenceImages: dataUrls.filter(Boolean) } : character
      )
    );
  };

  const parsedMasterUrls = useMemo(
    () =>
      masterReferenceUrls
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^https?:\/\//i.test(line)),
    [masterReferenceUrls]
  );

  const referenceCandidates = useMemo(
    () => [...masterReferenceImages, ...parsedMasterUrls],
    [masterReferenceImages, parsedMasterUrls]
  );

  const effectiveMasterReferences = useMemo(() => {
    if (officialMasterReference) {
      return [officialMasterReference];
    }
    return referenceCandidates;
  }, [officialMasterReference, referenceCandidates]);

  const requestCastBible = useMemo(() => serializeCastBibleForRequest(castBible), [castBible]);
  const availableCastCharacterNames = useMemo(
    () => castBible.map((character) => character.name.trim()).filter(Boolean),
    [castBible]
  );

  const resolveSceneMasterReferences = (scene: SceneItem | CompanionShot) => {
    const targetName = scene.onScreenCharacter?.trim().toLowerCase();
    if (targetName) {
      const characterMatch = castBible.find((character) => character.name.trim().toLowerCase() === targetName);
      if (characterMatch) {
        const refs = getEffectiveCharacterReferences(characterMatch);
        if (refs.length > 0) {
          return refs;
        }
      }
    }

    return effectiveMasterReferences;
  };

  useEffect(() => {
    if (!referenceCandidates.length) {
      setOfficialMasterReference(null);
      return;
    }

    if (!officialMasterReference || !referenceCandidates.includes(officialMasterReference)) {
      setOfficialMasterReference(referenceCandidates[0]);
    }
  }, [officialMasterReference, referenceCandidates]);

  const generateBeatSheet = async (): Promise<GenerateBeatSheetResponse> => {
    setBeatLoading(true);
    try {
      const response = await fetch("/api/generate-beats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            projectMode,
            title,
            originalScript,
            lockedVoiceOver,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            sceneCount,
            style,
            aspectRatio,
            colorGradePreset,
            strictMode,
            episodeHeader,
            fantasyBible,
            castBible: requestCastBible,
          },
        }),
      });

      const raw = await response.text();
      let payload: (GenerateBeatSheetResponse & { error?: string }) | null = null;
      try {
        payload = JSON.parse(raw) as GenerateBeatSheetResponse & { error?: string };
      } catch {
        payload = {
          error: raw.includes("FUNCTION_INVOCATION_TIMEOUT")
            ? "Vercel function timeout while generating beat sheet."
            : raw || "Beat sheet generation failed (non-JSON response).",
        } as GenerateBeatSheetResponse & { error?: string };
      }

      if (!response.ok || !payload?.beatSheet) {
        throw new Error(payload?.error || "Beat sheet generation failed.");
      }

      setBeatSheet(payload.beatSheet);
      setBeatSceneCount(payload.sceneCount);
      return { beatSheet: payload.beatSheet, sceneCount: payload.sceneCount };
    } finally {
      setBeatLoading(false);
    }
  };

  const generateCharacterMasterSheet = (characterId: string) => {
    setCharacterMasterSheets((prev) => {
      const character = castBible.find((item) => item.id === characterId);
      if (!character) return prev;
      return {
        ...prev,
        [characterId]: buildCharacterMasterSheet(character, projectMode, colorGradePreset),
      };
    });
  };

  const generateCharacterMasterImage = async (characterId: string, shot: CharacterMasterShot) => {
    const character = castBible.find((item) => item.id === characterId);
    if (!character) return;

    setCharacterMasterImageLoading((prev) => ({ ...prev, [shot.id]: true }));
    setCharacterMasterImageErrors((prev) => ({ ...prev, [shot.id]: "" }));
    setCharacterMasterImageMeta((prev) => ({ ...prev, [shot.id]: "" }));

    try {
      const masterReferenceImages = getEffectiveCharacterReferences(character);
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: shot.imagePrompt,
          sceneNumber: 9000 + Number.parseInt(shot.id.replace(/\D/g, "").slice(-3) || "1", 10),
          projectMode,
          aspectRatio: "9:16",
          useReferenceImage: masterReferenceImages.length > 0,
          referenceTag: normalizeReferenceTag(character.referenceTag || ""),
          style,
          colorGradePreset,
          lightingColor: shot.lightingColor,
          projectColorGradeLock,
          strictMode,
          continuitySeed: `character-master|${character.name}|${shot.label}`,
          masterReferenceImages,
        }),
      });

      const raw = await response.text();
      let payload: GenerateImageResponse = {};
      try {
        payload = JSON.parse(raw) as GenerateImageResponse;
      } catch {
        payload = {
          error: raw.includes("Request Entity Too Large")
            ? "Request too large. Use fewer or lighter reference images."
            : raw || "Character master image generation failed.",
        };
      }

      if (!response.ok) {
        throw new Error(payload.error || "Character master image generation failed.");
      }

      if (payload.taskId) {
        let resolvedImage: string | null = null;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await sleep(2000);
          const statusResponse = await fetch(`/api/generate-image?taskId=${encodeURIComponent(payload.taskId)}`, {
            method: "GET",
          });
          const statusPayload = (await statusResponse.json().catch(() => null)) as GenerateImageResponse | null;
          if (!statusResponse.ok) {
            throw new Error(statusPayload?.error || "Character master image status check failed.");
          }
          if (statusPayload?.imageDataUrl) {
            resolvedImage = statusPayload.imageDataUrl;
            payload.provider = statusPayload.provider || payload.provider;
            payload.fallbackFrom = statusPayload.fallbackFrom || payload.fallbackFrom;
            payload.modelUsed = statusPayload.modelUsed || payload.modelUsed;
            break;
          }
          if (statusPayload?.status === "failed") {
            throw new Error(statusPayload.error || "Character master image generation failed.");
          }
        }
        if (!resolvedImage) {
          throw new Error("Character master image generation is taking too long. Please retry.");
        }
        payload.imageDataUrl = resolvedImage;
      }

      if (!payload.imageDataUrl) {
        throw new Error(payload.error || "Character master image generation failed.");
      }

      const providerLabel = payload.provider
        ? payload.fallbackFrom
          ? `${payload.provider} (fallback from ${payload.fallbackFrom})`
          : payload.provider
        : "";
      const metaLabel = [providerLabel, payload.modelUsed].filter(Boolean).join(" · ");

      setCharacterMasterImageUrls((prev) => ({ ...prev, [shot.id]: payload.imageDataUrl as string }));
      setCharacterMasterImageMeta((prev) => ({ ...prev, [shot.id]: metaLabel }));
    } catch (imageError) {
      const message =
        imageError instanceof Error ? imageError.message : "Character master image generation failed.";
      setCharacterMasterImageErrors((prev) => ({ ...prev, [shot.id]: message }));
    } finally {
      setCharacterMasterImageLoading((prev) => ({ ...prev, [shot.id]: false }));
    }
  };

  const generateAllCharacterMasterImages = async (characterId: string) => {
      const shots = characterMasterSheets[characterId] || [];
      if (!shots.length) return;
      setCharacterMasterBatchLoading((prev) => ({ ...prev, [characterId]: true }));
      try {
        for (const shot of shots) {
          // sequential to reduce provider pressure and keep refs stable
          await generateCharacterMasterImage(characterId, shot);
        }
      } finally {
        setCharacterMasterBatchLoading((prev) => ({ ...prev, [characterId]: false }));
      }
    };

  const applyGeneratedMasterAsOfficial = (characterId: string, imageSrc: string) => {
    setCastBible((prev) =>
      prev.map((item) => {
        if (item.id !== characterId) return item;
        const current = item.masterReferenceImages || [];
        const nextImages = current.includes(imageSrc) ? current : [imageSrc, ...current].slice(0, 8);
        return {
          ...item,
          masterReferenceImages: nextImages,
          officialMasterReference: imageSrc,
        };
      })
    );
  };

  const generateSceneMetadata = async (sourceBeatSheet: BeatItem[]): Promise<SceneMetadata[]> => {
    const chunkSize = projectMode === "coastal-fantasy-drama" ? 4 : 8;
    const chunks = chunkScenes(sourceBeatSheet, chunkSize);
    const merged = new Map<number, SceneMetadata>();

    const requestMetadataChunk = async (chunk: BeatItem[]): Promise<SceneMetadata[]> => {
      const response = await fetch("/api/generate-scene-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            projectMode,
            title,
            originalScript,
            lockedVoiceOver,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            sceneCount,
            style,
            aspectRatio,
            colorGradePreset,
            strictMode,
            episodeHeader,
            fantasyBible,
            castBible: requestCastBible,
          },
          beatSheet: chunk,
        }),
      });

      const raw = await response.text();
      let payload: GenerateScenePayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateScenePayload;
      } catch {
        payload = {
          error: normalizeStageError(raw, "Scene metadata generation failed (non-JSON response)."),
        };
      }

      if (!response.ok || !payload?.scenes) {
        throw new Error(payload?.error || "Scene metadata generation failed.");
      }

      return payload.scenes as SceneMetadata[];
    };

    for (const chunk of chunks) {
      try {
        const chunkScenesResult = await requestMetadataChunk(chunk);
        for (const scene of chunkScenesResult) {
          merged.set(scene.sceneNumber, scene);
        }
      } catch (chunkError) {
        if (chunk.length === 1) {
          throw chunkError;
        }

        for (const beat of chunk) {
          const singleSceneResult = await requestMetadataChunk([beat]);
          for (const scene of singleSceneResult) {
            merged.set(scene.sceneNumber, scene);
          }
        }
      }
    }

    const missingBeats = sourceBeatSheet.filter((beat) => !merged.has(beat.beatNumber));
    for (const beat of missingBeats) {
      const singleSceneResult = await requestMetadataChunk([beat]);
      for (const scene of singleSceneResult) {
        merged.set(scene.sceneNumber, scene);
      }
    }

    return sourceBeatSheet.map((beat) => {
      const scene = merged.get(beat.beatNumber);
      if (scene) return scene;
      return fallbackSceneMetadataFromBeat(beat, projectMode, colorGradePreset, style, referenceTag, onScreenCharacter);
    });
  };

  const generatePromptBatches = async (sourceScenes: SceneMetadata[]): Promise<SceneItem[]> => {
    const chunkSize = projectMode === "coastal-fantasy-drama" ? 4 : 8;
    const chunks = chunkScenes(sourceScenes, chunkSize);
    const merged = new Map<number, SceneItem>();

    const requestPromptChunk = async (chunk: SceneMetadata[]): Promise<SceneItem[]> => {
      const response = await fetch("/api/generate-scene-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            title,
            style,
            aspectRatio,
            colorGradePreset,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            strictMode,
            episodeHeader,
            projectMode,
            fantasyBible,
            castBible: requestCastBible,
          },
          scenes: chunk.map((scene) => ({
            sceneNumber: scene.sceneNumber,
            phase: scene.phase,
            voLine: scene.voLine,
            onScreenCharacter: scene.onScreenCharacter,
            impliedOtherCharacter: scene.impliedOtherCharacter,
            sceneType: scene.sceneType,
            shotType: scene.shotType,
            shotGrammarPreset: scene.shotGrammarPreset,
            cameraStyle: scene.cameraStyle,
            actionStyle: scene.actionStyle,
            motionTemplateId: scene.motionTemplateId,
            scenePurpose: scene.scenePurpose,
            importance: scene.importance,
            useReferenceImage: scene.useReferenceImage,
            camera: scene.camera,
            lightingColor: scene.lightingColor,
          })),
        }),
      });

      const raw = await response.text();
      let payload: GenerateScenePayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateScenePayload;
      } catch {
        payload = {
          error: normalizeStageError(raw, "Scene prompt generation failed (non-JSON response)."),
        };
      }

      if (!response.ok || !payload?.scenes) {
        throw new Error(payload?.error || "Scene prompt generation failed.");
      }

      return payload.scenes as SceneItem[];
    };

    for (const chunk of chunks) {
      try {
        const chunkScenesResult = await requestPromptChunk(chunk);
        for (const scene of chunkScenesResult) {
          merged.set(scene.sceneNumber, scene);
        }
      } catch (chunkError) {
        if (chunk.length === 1) {
          throw chunkError;
        }

        for (const scene of chunk) {
          const singlePromptResult = await requestPromptChunk([scene]);
          for (const promptScene of singlePromptResult) {
            merged.set(promptScene.sceneNumber, promptScene);
          }
        }
      }
    }

    const missingScenes = sourceScenes.filter((scene) => !merged.has(scene.sceneNumber));
    for (const scene of missingScenes) {
      const singlePromptResult = await requestPromptChunk([scene]);
      for (const promptScene of singlePromptResult) {
        merged.set(promptScene.sceneNumber, promptScene);
      }
    }

    return sourceScenes.map((scene) => {
      const mergedScene = merged.get(scene.sceneNumber);
      if (!mergedScene) {
        throw new Error(`Missing prompt batch result for scene ${scene.sceneNumber}.`);
      }
      return mergedScene;
    });
  };

  const regenerateSingleScene = async (scene: SceneItem) => {
    if (!result) return;

    setScenePromptRegenerating((prev) => ({ ...prev, [scene.sceneNumber]: true }));
    setError(null);

    try {
      const response = await fetch("/api/generate-scene-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            title,
            style,
            aspectRatio,
            colorGradePreset,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            strictMode,
            episodeHeader,
            projectMode,
            fantasyBible,
            castBible: requestCastBible,
          },
          scenes: [
            {
              sceneNumber: scene.sceneNumber,
              phase: scene.phase,
              voLine: scene.voLine,
              onScreenCharacter: scene.onScreenCharacter,
              impliedOtherCharacter: scene.impliedOtherCharacter,
              sceneType: scene.sceneType,
              shotType: scene.shotType,
              shotGrammarPreset: scene.shotGrammarPreset,
              cameraStyle: scene.cameraStyle,
              actionStyle: scene.actionStyle,
              motionTemplateId: scene.motionTemplateId,
              scenePurpose: scene.scenePurpose,
              importance: scene.importance,
              useReferenceImage: scene.useReferenceImage,
              camera: scene.camera,
              lightingColor: scene.lightingColor,
            },
          ],
        }),
      });

      const raw = await response.text();
      let payload: GenerateScenePayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateScenePayload;
      } catch {
        payload = {
          error: normalizeStageError(raw, "Single scene regeneration failed (non-JSON response)."),
        };
      }

      if (!response.ok || !payload?.scenes?.length) {
        throw new Error(payload?.error || "Single scene regeneration failed.");
      }

      const regenerated = payload.scenes[0] as SceneItem;
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...regenerated,
                  companionShots: item.companionShots || [],
                }
              : item
          ),
        };
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Single scene regeneration failed.";
      setError(message);
    } finally {
      setScenePromptRegenerating((prev) => ({ ...prev, [scene.sceneNumber]: false }));
    }
  };

  const generateSceneImage = async (scene: SceneItem | CompanionShot) => {
    if (!result) return;
    const isCompanion = "id" in scene;
    const loadingKey = isCompanion ? scene.id : scene.sceneNumber;

    if (isCompanion) {
      setCompanionImageLoading((prev) => ({ ...prev, [loadingKey]: true }));
      setCompanionImageErrors((prev) => ({ ...prev, [loadingKey]: "" }));
      setCompanionImageMeta((prev) => ({ ...prev, [loadingKey]: "" }));
    } else {
      setSceneImageLoading((prev) => ({ ...prev, [loadingKey]: true }));
      setSceneImageErrors((prev) => ({ ...prev, [loadingKey]: "" }));
      setSceneImageMeta((prev) => ({ ...prev, [loadingKey]: "" }));
    }

    try {
      const sceneMasterReferences = resolveSceneMasterReferences(scene);
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: scene.imagePrompt,
          sceneNumber: isCompanion ? scene.parentSceneNumber : scene.sceneNumber,
          projectMode,
          aspectRatio,
          useReferenceImage: scene.useReferenceImage,
          referenceTag,
          style,
          colorGradePreset,
          lightingColor: scene.lightingColor,
          projectColorGradeLock,
          strictMode,
          continuitySeed: `${result.title}|${scene.onScreenCharacter || referenceTag || "NO_REF"}`,
          masterReferenceImages: sceneMasterReferences,
        }),
      });

      const raw = await response.text();
      let payload: GenerateImageResponse = {};
      try {
        payload = JSON.parse(raw) as GenerateImageResponse;
      } catch {
        payload = {
          error: raw.includes("Request Entity Too Large")
            ? "Request too large. Use fewer/smaller master reference images."
            : raw || "Image generation failed (non-JSON response).",
        };
      }

      if (!response.ok) {
        throw new Error(payload.error || "Image generation failed.");
      }

      if (payload.taskId) {
        let resolvedImage: string | null = null;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await sleep(2000);

          const statusResponse = await fetch(`/api/generate-image?taskId=${encodeURIComponent(payload.taskId)}`, {
            method: "GET",
          });
          const statusPayload = (await statusResponse.json().catch(() => null)) as GenerateImageResponse | null;

          if (!statusResponse.ok) {
            throw new Error(statusPayload?.error || "Image generation status check failed.");
          }

          if (statusPayload?.imageDataUrl) {
            resolvedImage = statusPayload.imageDataUrl;
            break;
          }

          if (statusPayload?.status === "failed") {
            throw new Error(statusPayload.error || "Image generation failed.");
          }
        }

        if (!resolvedImage) {
          throw new Error("Image generation is taking too long. Please retry.");
        }

        payload.imageDataUrl = resolvedImage;
      }

      if (!payload.imageDataUrl) {
        throw new Error(payload.error || "Image generation failed.");
      }

      const providerLabel = payload.provider
        ? payload.fallbackFrom
          ? `${payload.provider} (fallback from ${payload.fallbackFrom})`
          : payload.provider
        : "";
      const metaLabel = [providerLabel, payload.modelUsed].filter(Boolean).join(" · ");

      if (isCompanion) {
        setCompanionImages((prev) => ({ ...prev, [loadingKey]: payload.imageDataUrl as string }));
        setCompanionImageMeta((prev) => ({ ...prev, [loadingKey]: metaLabel }));
      } else {
        setSceneImages((prev) => ({ ...prev, [loadingKey]: payload.imageDataUrl as string }));
        setSceneImageMeta((prev) => ({ ...prev, [loadingKey]: metaLabel }));
      }
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Image generation failed.";
      if (isCompanion) {
        setCompanionImageErrors((prev) => ({ ...prev, [loadingKey]: message }));
      } else {
        setSceneImageErrors((prev) => ({ ...prev, [loadingKey]: message }));
      }
    } finally {
      if (isCompanion) {
        setCompanionImageLoading((prev) => ({ ...prev, [loadingKey]: false }));
      } else {
        setSceneImageLoading((prev) => ({ ...prev, [loadingKey]: false }));
      }
    }
  };

  const generateCompanionShot = async (scene: SceneItem, kind: "broll" | "transition") => {
    if (!result) return;

    setCompanionLoading((prev) => ({ ...prev, [scene.sceneNumber]: kind }));
    setCompanionImageErrors((prev) => ({
      ...prev,
      [`scene-${scene.sceneNumber}-broll`]: "",
      [`scene-${scene.sceneNumber}-transition`]: "",
    }));
    try {
      const response = await fetch("/api/generate-companion-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: result.title,
          style: result.style,
          colorGradePreset,
          settingNote: result.settingNote,
          characterReferenceGuidance: result.characterReferenceGuidance,
          referenceTag,
          projectColorGradeLock,
          strictMode,
          scene,
        }),
      });

      const raw = await response.text();
      let payload: GenerateCompanionShotPayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateCompanionShotPayload;
      } catch {
        payload = { error: raw || "Failed to generate companion shot." };
      }

      if (!response.ok || !payload.shot) {
        throw new Error(payload.error || "Failed to generate companion shot.");
      }

      const createdShot = payload.shot;
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...item,
                  companionShots: [...(item.companionShots || []), createdShot],
                }
              : item
          ),
        };
      });

      await generateSceneImage(createdShot);
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : "Failed to generate companion shot.";
      setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-${kind}`]: message }));
    } finally {
      setCompanionLoading((prev) => ({ ...prev, [scene.sceneNumber]: null }));
    }
  };

  const generateShotPack = async (scene: SceneItem) => {
    if (!result) return;

    setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: true }));
    setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: "" }));

    try {
      const response = await fetch("/api/generate-shot-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          style: result.style,
          colorGradePreset,
          settingNote: result.settingNote,
          characterReferenceGuidance: result.characterReferenceGuidance,
          referenceTag,
          projectColorGradeLock,
          strictMode,
          coverageMode: "default",
          scene,
        }),
      });

      const raw = await response.text();
      let payload: GenerateShotPackPayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateShotPackPayload;
      } catch {
        payload = { error: raw || "Failed to generate shot pack." };
      }

      if (!response.ok || !payload?.shots?.length) {
        throw new Error(payload?.error || "Failed to generate shot pack.");
      }

      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...item,
                  companionShots: [...(item.companionShots || []), ...payload!.shots!],
                }
              : item
          ),
        };
      });
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Failed to generate shot pack.";
      setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: message }));
    } finally {
      setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: false }));
    }
  };

  const generateDialogueCoverage = async (scene: SceneItem) => {
    if (!result) return;

    setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: true }));
    setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: "" }));

    try {
      const response = await fetch("/api/generate-shot-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          style: result.style,
          colorGradePreset,
          settingNote: result.settingNote,
          characterReferenceGuidance: result.characterReferenceGuidance,
          referenceTag,
          projectColorGradeLock,
          strictMode,
          coverageMode: "dialogue",
          scene,
        }),
      });

      const raw = await response.text();
      let payload: GenerateShotPackPayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateShotPackPayload;
      } catch {
        payload = { error: raw || "Failed to generate dialogue coverage." };
      }

      if (!response.ok || !payload?.shots?.length) {
        throw new Error(payload?.error || "Failed to generate dialogue coverage.");
      }

      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...item,
                  companionShots: payload!.shots!,
                }
              : item
          ),
        };
      });
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : "Failed to generate dialogue coverage.";
      setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: message }));
    } finally {
      setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: false }));
    }
  };

  const regenerateShotPack = async (scene: SceneItem) => {
    if (!result) return;

    setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: true }));
    setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: "" }));

    try {
      const response = await fetch("/api/generate-shot-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          style: result.style,
          colorGradePreset,
          settingNote: result.settingNote,
          characterReferenceGuidance: result.characterReferenceGuidance,
          referenceTag,
          projectColorGradeLock,
          strictMode,
          scene,
        }),
      });

      const raw = await response.text();
      let payload: GenerateShotPackPayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateShotPackPayload;
      } catch {
        payload = { error: raw || "Failed to regenerate shot pack." };
      }

      if (!response.ok || !payload?.shots?.length) {
        throw new Error(payload?.error || "Failed to regenerate shot pack.");
      }

      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...item,
                  companionShots: payload!.shots!,
                }
              : item
          ),
        };
      });
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Failed to regenerate shot pack.";
      setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-pack`]: message }));
    } finally {
      setShotPackLoading((prev) => ({ ...prev, [scene.sceneNumber]: false }));
    }
  };

  const generateAllCompanionImages = async (scene: SceneItem) => {
    if (!scene.companionShots?.length) return;
    setCompanionBatchImageLoading((prev) => ({ ...prev, [scene.sceneNumber]: true }));
    try {
      for (const shot of scene.companionShots) {
        await generateSceneImage(shot);
      }
    } finally {
      setCompanionBatchImageLoading((prev) => ({ ...prev, [scene.sceneNumber]: false }));
    }
  };

  const overrideSceneType = (sceneNumber: number, nextType: DirectorSceneType) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber ? applySceneTypeOverride(scene, nextType) : scene
        ),
      };
    });
  };

  const overrideSceneOnScreenCharacter = (sceneNumber: number, nextCharacter: string) => {
    setResult((prev) => {
      if (!prev) return prev;

      const normalizedCharacter = nextCharacter.trim();
      const lowerCharacter = normalizedCharacter.toLowerCase();
      const impliedFallback =
        normalizedCharacter && castBible.length
          ? castBible.find((character) => character.name.trim().toLowerCase() !== lowerCharacter)?.name || ""
          : "";

      return {
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? {
                ...scene,
                onScreenCharacter: normalizedCharacter,
                impliedOtherCharacter:
                  normalizedCharacter && scene.impliedOtherCharacter?.trim().toLowerCase() === lowerCharacter
                    ? impliedFallback
                    : scene.impliedOtherCharacter,
                useReferenceImage: normalizedCharacter
                  ? Boolean(
                      castBible.find(
                        (character) =>
                          character.name.trim().toLowerCase() === lowerCharacter &&
                          getEffectiveCharacterReferences(character).length > 0
                      ) || referenceTag
                    )
                  : scene.useReferenceImage,
              }
            : scene
        ),
      };
    });
  };

  const overrideSceneImpliedOtherCharacter = (sceneNumber: number, nextCharacter: string) => {
    setResult((prev) => {
      if (!prev) return prev;

      const normalizedCharacter = nextCharacter.trim();

      return {
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? {
                ...scene,
                impliedOtherCharacter:
                  normalizedCharacter && normalizedCharacter !== scene.onScreenCharacter ? normalizedCharacter : "",
              }
            : scene
        ),
      };
    });
  };

  const onGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const beatResponse = await generateBeatSheet();
      const metadataScenes = await generateSceneMetadata(beatResponse.beatSheet);
      const promptedScenes = await generatePromptBatches(metadataScenes);
      const assembledFilmPack = assembleFilmPackFromScenes({
        scenes: promptedScenes,
        beatSheet: beatResponse.beatSheet,
        settings: {
          projectMode,
          title,
          style,
          aspectRatio,
          colorGradePreset,
          episodeHeader,
          narratorCharacter,
          onScreenCharacter,
          fantasyBible,
          castBible: requestCastBible,
        },
        lockedVoiceOver,
        referenceTag,
      });

      setResult(assembledFilmPack);
      setBeatSheet(beatResponse.beatSheet);
      setBeatSceneCount(beatResponse.sceneCount);
      setSceneImages({});
      setCompanionImages({});
      setSceneImageLoading({});
      setCompanionImageLoading({});
      setSceneImageErrors({});
      setCompanionImageErrors({});
      setCompanionLoading({});
      setScenePromptRegenerating({});
      setShotPackLoading({});
      setCompanionBatchImageLoading({});
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Generation failed.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
      <section className="mb-8 rounded-3xl border border-white/15 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Film Pre-Production Toolkit</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Film Pack Studio</h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-300 sm:text-base">
          Turn an original script into a production-ready film pack: preserved VO, scene structure, Kling O1 prompts,
          and image-to-video prompt flow tuned for fast short-video execution with a small B-roll layer for pacing.
        </p>
      </section>

      <form onSubmit={onGenerate} className="space-y-5 rounded-2xl border border-white/10 bg-zinc-900/80 p-5 sm:p-6">
        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="text-sm font-medium text-zinc-100">Project Mode</p>
            <p className="text-xs text-zinc-400">
              Keep the existing realism workflow, or prepare separate Tawau / Sabah and fantasy-drama setups without changing the old mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadProjectModeSample("singapore-realism")}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 transition hover:bg-white/[0.04]"
            >
              Load realism sample
            </button>
            <button
              type="button"
              onClick={() => loadProjectModeSample("coastal-fantasy-drama")}
              className="rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-100 transition hover:bg-sky-500/[0.12]"
            >
              Load fantasy sample
            </button>
            <button
              type="button"
              onClick={() => loadProjectModeSample("tawau-sabah-realism")}
              className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-100 transition hover:bg-emerald-500/[0.12]"
            >
              Load Tawau sample
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROJECT_MODES.map((mode) => {
              const active = projectMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setProjectMode(mode.value)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-cyan-300/60 bg-cyan-500/10 text-cyan-100"
                      : "border-white/10 bg-black/20 text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="mt-1 text-xs text-zinc-400">{mode.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Optional Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. The Corridor Promise"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Narrator / POV Character</span>
            <input
              value={narratorCharacter}
              onChange={(event) => setNarratorCharacter(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. Bryan"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Primary On-Screen Character</span>
            <input
              value={onScreenCharacter}
              onChange={(event) => setOnScreenCharacter(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. Samuel"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Optional Character Reference Tag</span>
            <input
              value={referenceTag}
              onChange={(event) => setReferenceTag(event.target.value)}
              onBlur={(event) => setReferenceTag(normalizeReferenceTag(event.target.value))}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="Leave blank if this story has no main character reference"
            />
          </label>
        </div>

        <p className="text-xs text-zinc-400">
          Use these two fields when one person narrates about another. Example: narrator = Bryan, on-screen character =
          Samuel.
        </p>

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Cast Bible</p>
              <p className="text-xs text-zinc-400">
                Add recurring roles for multi-character dramas. Each scene can then anchor itself to one clear on-screen
                character while keeping others implied.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousEpisodeSource?.filmPack.castBible?.length ? (
                <button
                  type="button"
                  onClick={applyPreviousCastContinuity}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Carry cast continuity
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setCastBible((prev) => [...prev, createCastMember()].slice(0, 8))}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
              >
                Add character
              </button>
            </div>
          </div>
          {previousEpisodeSource?.filmPack.castBible?.length ? (
            <p className="text-[11px] text-zinc-500">
              Pull roles, identity notes, relationship continuity, wardrobe continuity, and reference tags from{" "}
              {previousEpisodeSource.filmPack.episodeHeader?.episodeNumber || "the previous episode"}.
            </p>
          ) : null}

          {castBible.length ? (
            <div className="space-y-4">
              {castBible.map((character, index) => {
                const characterCandidates = getCharacterReferenceCandidates(character);
                const officialRef = character.officialMasterReference;
                const masterSheetShots = characterMasterSheets[character.id] || [];
                return (
                  <div key={character.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-100">Character {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => setCastBible((prev) => prev.filter((item) => item.id !== character.id))}
                        className="rounded-md border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Character name</span>
                        <input
                          value={character.name}
                          onChange={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) => (item.id === character.id ? { ...item, name: event.target.value } : item))
                            )
                          }
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                          placeholder="e.g. Amir"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Role</span>
                        <select
                          value={character.role}
                          onChange={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) =>
                                item.id === character.id ? { ...item, role: event.target.value as CastMemberInput["role"] } : item
                              )
                            )
                          }
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                        >
                          {CAST_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Reference tag</span>
                        <input
                          value={character.referenceTag || ""}
                          onChange={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) =>
                                item.id === character.id ? { ...item, referenceTag: event.target.value } : item
                              )
                            )
                          }
                          onBlur={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) =>
                                item.id === character.id
                                  ? { ...item, referenceTag: normalizeReferenceTag(event.target.value) }
                                  : item
                              )
                            )
                          }
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                          placeholder="[AMIR_REF]"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Identity note</span>
                        <input
                          value={character.identityNote || ""}
                          onChange={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) =>
                                item.id === character.id ? { ...item, identityNote: event.target.value } : item
                              )
                            )
                          }
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                          placeholder="e.g. reserved young fisherman, sharp eyes, calm energy"
                        />
                      </label>
                    </div>

                    <label className="mt-4 grid gap-2">
                      <span className="text-xs font-medium text-zinc-300">Relationship continuity</span>
                      <input
                        value={character.relationshipNote || ""}
                        onChange={(event) =>
                          setCastBible((prev) =>
                            prev.map((item) =>
                              item.id === character.id ? { ...item, relationshipNote: event.target.value } : item
                            )
                          )
                        }
                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                        placeholder="e.g. quietly drawn to Sara, tense with Rafiq, distrusts Mayor Iskandar"
                      />
                    </label>

                    <label className="mt-4 grid gap-2">
                      <span className="text-xs font-medium text-zinc-300">Wardrobe / continuity note</span>
                      <input
                        value={character.wardrobeNote || ""}
                        onChange={(event) =>
                          setCastBible((prev) =>
                            prev.map((item) =>
                              item.id === character.id ? { ...item, wardrobeNote: event.target.value } : item
                            )
                          )
                        }
                        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                        placeholder="e.g. dark indigo jacket, practical work trousers, silver bracelet"
                      />
                    </label>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Upload 1-4 refs</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            void onUploadCastRefs(character.id, event);
                          }}
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-200"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-zinc-300">Reference image URLs</span>
                        <textarea
                          value={character.masterReferenceUrls || ""}
                          onChange={(event) =>
                            setCastBible((prev) =>
                              prev.map((item) =>
                                item.id === character.id ? { ...item, masterReferenceUrls: event.target.value } : item
                              )
                            )
                          }
                          className="min-h-20 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                          placeholder="https://.../amir-1.jpg"
                        />
                      </label>
                    </div>

                    {characterCandidates.length ? (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {characterCandidates.map((src, candidateIndex) => {
                          const isOfficial = officialRef === src;
                          return (
                            <div
                              key={`${src.slice(0, 40)}-${candidateIndex}`}
                              className={`overflow-hidden rounded-lg border ${isOfficial ? "border-cyan-300/70" : "border-white/10"}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={`${character.name || "Character"} ref ${candidateIndex + 1}`} className="h-20 w-full object-cover" />
                              <button
                                type="button"
                                onClick={() =>
                                  setCastBible((prev) =>
                                    prev.map((item) =>
                                      item.id === character.id ? { ...item, officialMasterReference: src } : item
                                    )
                                  )
                                }
                                className={`w-full border-t px-2 py-1 text-[11px] font-medium ${
                                  isOfficial
                                    ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-200"
                                    : "border-white/10 bg-black/30 text-zinc-300"
                                }`}
                              >
                                {isOfficial ? "Official ref" : "Set official"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-500/[0.04] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">
                            Character Master Sheet
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            Build 4 neutral identity anchors first, then use one as the official master ref for scene generation.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => generateCharacterMasterSheet(character.id)}
                            className="rounded-md border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20"
                          >
                            {masterSheetShots.length ? "Regenerate Sheet" : "Generate Character Sheet"}
                          </button>
                          {masterSheetShots.length ? (
                            <button
                              type="button"
                              onClick={() => void generateAllCharacterMasterImages(character.id)}
                              disabled={characterMasterBatchLoading[character.id]}
                              className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                            >
                              {characterMasterBatchLoading[character.id] ? "Generating..." : "Generate All Images"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {masterSheetShots.length ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {masterSheetShots.map((shot) => {
                            const generatedUrl = characterMasterImageUrls[shot.id];
                            const generatedMeta = characterMasterImageMeta[shot.id];
                            const generatedError = characterMasterImageErrors[shot.id];
                            const isLoading = characterMasterImageLoading[shot.id];
                            const isOfficialGenerated = officialRef === generatedUrl && Boolean(generatedUrl);

                            return (
                              <div key={shot.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-zinc-100">{shot.label}</p>
                                    <p className="text-[11px] text-zinc-400">{shot.framing}</p>
                                  </div>
                                  <CopyButton text={shot.imagePrompt} label="Copy prompt" />
                                </div>
                                <p className="mb-2 text-xs text-zinc-300">{shot.purpose}</p>
                                <p className="rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-6 text-zinc-300">
                                  {shot.imagePrompt}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void generateCharacterMasterImage(character.id, shot)}
                                    disabled={isLoading}
                                    className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                                  >
                                    {isLoading ? "Generating..." : generatedUrl ? "Regenerate image" : "Generate image"}
                                  </button>
                                  {generatedUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => applyGeneratedMasterAsOfficial(character.id, generatedUrl)}
                                      className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
                                        isOfficialGenerated
                                          ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-200"
                                          : "border-cyan-300/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                                      }`}
                                    >
                                      {isOfficialGenerated ? "Official ref" : "Use as official"}
                                    </button>
                                  ) : null}
                                </div>
                                {generatedMeta ? <p className="mt-2 text-[11px] uppercase tracking-wide text-cyan-300">{generatedMeta}</p> : null}
                                {generatedError ? <p className="mt-2 text-[11px] text-rose-300">{generatedError}</p> : null}
                                {generatedUrl ? (
                                  <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={generatedUrl} alt={`${character.name || "Character"} ${shot.label}`} className="h-64 w-full object-cover" />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              Keep this empty for one-character stories. For drama series, add your recurring lead, female lead, ally,
              antagonist, and supporting roles here.
            </p>
          )}
        </section>

        {projectMode === "coastal-fantasy-drama" ? (
          <section className="space-y-4 rounded-xl border border-sky-400/20 bg-sky-500/[0.04] p-4">
            <div>
              <p className="text-sm font-medium text-zinc-100">Fantasy Bible</p>
              <p className="text-xs text-zinc-400">
                This block prepares the new fantasy-drama mode. We are saving and sending these fields now, so we can wire them into prompt logic next without touching the Singapore realism setup.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Hero Name</span>
                <input
                  value={fantasyBible.heroName || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, heroName: event.target.value }))}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="e.g. Kai"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Power Type</span>
                <input
                  value={fantasyBible.powerType || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, powerType: event.target.value }))}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="e.g. control over sea currents and tidal force"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Enemy Type</span>
                <input
                  value={fantasyBible.enemyType || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, enemyType: event.target.value }))}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="e.g. sea-born hunters, rival wielders, harbor cult"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">World Tone</span>
                <input
                  value={fantasyBible.worldTone || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, worldTone: event.target.value }))}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="e.g. grounded coastal fantasy, mythic but modern"
                />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Core Premise</span>
              <textarea
                value={fantasyBible.corePremise || ""}
                onChange={(event) => setFantasyBible((prev) => ({ ...prev, corePremise: event.target.value }))}
                className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="A young man discovers he can command the sea, but every use of his power draws stronger enemies toward the coast."
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Power Limits</span>
                <textarea
                  value={fantasyBible.powerLimits || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, powerLimits: event.target.value }))}
                  className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="Stronger near the sea, drains stamina, unstable under fear or anger."
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Ending Hook</span>
                <textarea
                  value={fantasyBible.endingHook || ""}
                  onChange={(event) => setFantasyBible((prev) => ({ ...prev, endingHook: event.target.value }))}
                  className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                  placeholder="He wins the first fight, but the tide answers back and reveals a far greater enemy."
                />
              </label>
            </div>
          </section>
        ) : null}

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Episode Header</p>
              <p className="text-xs text-zinc-400">
              Lightweight series context for recurring episodes. Use this when you want continuity, a clear episode goal,
              and a usable cliffhanger without adding more workflow complexity.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousEpisodeSource ? (
                <button
                  type="button"
                  onClick={applyPreviousEpisodeContext}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Use previous episode
                </button>
              ) : null}
              <button
                type="button"
                onClick={seedNextEpisode}
                className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
              >
                Seed next episode
              </button>
            </div>
          </div>
          {previousEpisodeSource ? (
            <p className="text-[11px] text-zinc-500">
              Source: {previousEpisodeSource.filmPack.episodeHeader?.episodeNumber || "Previous episode"}{" "}
              {previousEpisodeSource.filmPack.episodeHeader?.episodeTitle
                ? `· ${previousEpisodeSource.filmPack.episodeHeader?.episodeTitle}`
                : ""}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Season</span>
              <input
                value={episodeHeader.seasonLabel || ""}
                onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, seasonLabel: event.target.value }))}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="e.g. Season 1"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Episode</span>
              <input
                value={episodeHeader.episodeNumber || ""}
                onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, episodeNumber: event.target.value }))}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="e.g. Episode 1"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Episode Title</span>
              <input
                value={episodeHeader.episodeTitle || ""}
                onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, episodeTitle: event.target.value }))}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="e.g. The First Tide"
              />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Episode Goal</span>
            <input
              value={episodeHeader.episodeGoal || ""}
              onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, episodeGoal: event.target.value }))}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="What this episode must accomplish emotionally or narratively"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Previously On</span>
              <textarea
                value={episodeHeader.previouslyOn || ""}
                onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, previouslyOn: event.target.value }))}
                className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="Short recap of what the audience should already know before this episode starts"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">Continuity Log</span>
              <textarea
                value={episodeHeader.continuityLog || ""}
                onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, continuityLog: event.target.value }))}
                className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
                placeholder="Current relationship states, injuries, secrets, costumes, or story facts that must stay consistent"
              />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Cliffhanger / Hook</span>
            <textarea
              value={episodeHeader.cliffhanger || ""}
              onChange={(event) => setEpisodeHeader((prev) => ({ ...prev, cliffhanger: event.target.value }))}
              className="min-h-20 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="What unresolved question or hook should this episode end on"
            />
          </label>
        </section>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Original Script / Story</span>
          <textarea
            value={originalScript}
            onChange={(event) => setOriginalScript(event.target.value)}
            className="min-h-52 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            placeholder="Paste full script here"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Locked VO Script (Optional, no rewrite)</span>
          <textarea
            value={lockedVoiceOver}
            onChange={(event) => setLockedVoiceOver(event.target.value)}
            className="min-h-36 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            placeholder="Paste your final VO here. If provided, system will keep this VO exactly."
          />
        </label>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-zinc-100">Character Master Reference (for consistency)</p>
          <p className="text-xs text-zinc-400">
            Optional. Leave this empty for stories with no main character reference. If used, choose one official master ref and scene image generation will bind to it by default.
          </p>
          <label className="grid gap-2">
            <span className="text-xs text-zinc-300">Upload 1-4 master images (best for Gemini)</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onUploadMasterRefs}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-200"
            />
          </label>
          {referenceCandidates.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {referenceCandidates.map((src, index) => {
                const isOfficial = officialMasterReference === src;
                return (
                <div
                  key={`${src.slice(0, 40)}-${index}`}
                  className={`overflow-hidden rounded-lg border ${isOfficial ? "border-cyan-300/70" : "border-white/10"}`}
                >
                  {/* Remote master refs can come from arbitrary providers, so this preview intentionally avoids Next image optimization. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Master ref ${index + 1}`}
                    className="h-20 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setOfficialMasterReference(src)}
                    className={`w-full border-t px-2 py-1 text-[11px] font-medium ${
                      isOfficial
                        ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-200"
                        : "border-white/10 bg-black/30 text-zinc-300"
                    }`}
                  >
                    {isOfficial ? "Official master ref" : "Set as official"}
                  </button>
                </div>
                );
              })}
            </div>
          ) : null}
          <label className="grid gap-2">
            <span className="text-xs text-zinc-300">
              Optional master image URL list (one per line, used by Kling image_list)
            </span>
            <textarea
              value={masterReferenceUrls}
              onChange={(event) => setMasterReferenceUrls(event.target.value)}
              className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="https://.../master-1.jpg"
            />
          </label>
        </section>

        {beatSheet.length > 0 ? (
          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">Beat Sheet Preview</p>
                <p className="text-xs text-zinc-400">
                  {beatSceneCount || beatSheet.length} beats locked for the next scene pack generation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void generateBeatSheet().catch((beatError) => {
                    setError(beatError instanceof Error ? beatError.message : "Beat sheet generation failed.");
                  });
                }}
                disabled={beatLoading}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15 disabled:opacity-60"
              >
                {beatLoading ? "Refreshing..." : "Refresh Beat Sheet"}
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {beatSheet.map((beat) => (
                <div key={beat.beatNumber} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-100">Beat {beat.beatNumber}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.phase}</span>
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/[0.06] px-2 py-0.5 text-sky-200">
                      {beat.storyArc}
                    </span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.role}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.importance}</span>
                  </div>
                  <p className="mb-2 max-h-14 overflow-hidden">{beat.voLine}</p>
                  <p className="text-zinc-400">{beat.purpose}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Scene Count</span>
            <select
              value={sceneCount}
              onChange={(event) => {
                const value = event.target.value;
                setSceneCount(value === "auto" ? "auto" : (Number(value) as SceneCountInput));
              }}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              {SCENE_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count === "auto" ? "Auto (recommended)" : `${count} scenes`}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Tone / Style</span>
            <select
              value={style}
              onChange={(event) => setStyle(event.target.value as FilmTone)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              {availableFilmStyles.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Frame Ratio</span>
            <select
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value as AspectRatio)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Color Grade Preset</span>
            <select
              value={colorGradePreset}
              onChange={(event) => setColorGradePreset(event.target.value as ColorGradePreset)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              {availableColorPresets.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="space-y-1">
            <span className="text-sm font-medium text-zinc-100">Strict Mode (API)</span>
            <p className="text-xs text-zinc-400">
              ON = stability-first, concise and consistent. OFF = more creative variation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStrictMode((value) => !value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              strictMode
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-200"
                : "border-white/20 bg-black/40 text-zinc-300"
            }`}
          >
            {strictMode ? "ON" : "OFF"}
          </button>
        </label>

        <RulesPanel key={projectMode} projectMode={projectMode} />

        <button
          type="submit"
          disabled={loading || beatLoading}
          className="inline-flex items-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Generating film pack..." : beatLoading ? "Generating beat sheet..." : "Generate Film Pack"}
        </button>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </form>

      {result ? (
        <section className="mt-8 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-100">{result.title}</h2>
                <p className="text-sm text-zinc-300">{result.style}</p>
                <p className="text-xs text-zinc-400">{colorGradePreset} · {aspectRatio}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                {result.scenes.length} scenes
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                {referenceSceneCount} reference-tag scenes
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                strict mode: {strictMode ? "on" : "off"}
              </span>
              {result.beatSheet?.length ? (
                <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                  beat-first flow: on
                </span>
              ) : null}
            </div>

            <div className="sticky top-3 z-10 mb-4 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/85 p-3 backdrop-blur">
                <CopyButton text={fullCopy} label="Copy full output" />
                <button
                  type="button"
                  onClick={saveCurrentPack}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Save Archive
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(toFilmPackText(result), "film-pack.txt", "text/plain")}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Download TXT
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(toFilmPackMarkdown(result), "film-pack.md", "text/markdown")}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Download Markdown
                </button>
            </div>

            <div className="space-y-3 text-sm text-zinc-300">
              <p>
                <span className="font-semibold text-zinc-100">
                  {projectMode === "tawau-sabah-realism" ? "Tawau / Sabah setting note:" : projectMode === "coastal-fantasy-drama" ? "Fantasy setting note:" : "Singapore setting note:"}
                </span>{" "}
                {result.settingNote}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Preserved VO:</span> {result.preservedVoiceOverScript}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Character Reference Guidance:</span>{" "}
                {result.characterReferenceGuidance}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Color Grade Lock:</span> {projectColorGradeLock}
              </p>
              {officialMasterReference ? (
                <p>
                  <span className="font-semibold text-zinc-100">Official Master Ref:</span>{" "}
                  {officialMasterReference.startsWith("data:") ? "uploaded master image" : officialMasterReference}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {result.scenes.map((scene) => (
              <SceneCard
                key={`${scene.sceneNumber}-${scene.voLine.slice(0, 20)}`}
                scene={scene}
                availableCharacters={availableCastCharacterNames}
                generatedImageUrl={sceneImages[scene.sceneNumber]}
                generatingImage={sceneImageLoading[scene.sceneNumber]}
                imageError={sceneImageErrors[scene.sceneNumber]}
                imageMeta={sceneImageMeta[scene.sceneNumber]}
                companionImageUrls={companionImages}
                companionImageMeta={companionImageMeta}
                companionImageLoading={companionImageLoading}
                companionImageErrors={companionImageErrors}
                generatingCompanionKind={companionLoading[scene.sceneNumber] || null}
                generatingShotPack={shotPackLoading[scene.sceneNumber]}
                generatingAllCompanionImages={companionBatchImageLoading[scene.sceneNumber]}
                hasShotPack={Boolean(scene.companionShots?.length)}
                companionActionError={
                  companionImageErrors[`scene-${scene.sceneNumber}-pack`] ||
                  companionImageErrors[`scene-${scene.sceneNumber}-broll`] ||
                  companionImageErrors[`scene-${scene.sceneNumber}-transition`]
                }
                onGenerateShotPack={generateShotPack}
                onGenerateDialogueCoverage={generateDialogueCoverage}
                onRegenerateShotPack={regenerateShotPack}
                onGenerateAllCompanionImages={generateAllCompanionImages}
                onRegenerateScene={regenerateSingleScene}
                regeneratingScene={scenePromptRegenerating[scene.sceneNumber]}
                onSceneTypeChange={overrideSceneType}
                onOnScreenCharacterChange={overrideSceneOnScreenCharacter}
                onImpliedOtherCharacterChange={overrideSceneImpliedOtherCharacter}
                onGenerateImage={generateSceneImage}
                onGenerateCompanion={generateCompanionShot}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
        <h3 className="mb-3 text-lg font-semibold text-zinc-100">Saved Archives</h3>
        {savedPacks.length === 0 ? (
          <p className="text-sm text-zinc-400">No saved film packs yet.</p>
        ) : (
          <div className="space-y-2">
            {savedPacks.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="text-sm text-zinc-300">
                  <p className="font-medium text-zinc-100">{record.title}</p>
                  <p className="text-xs text-zinc-400">
                    {record.style} · {record.sceneCount} scenes ·{" "}
                    {new Date(record.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openSavedPack(record.id)}
                    className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedPack(record.id)}
                    className="rounded-md border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
