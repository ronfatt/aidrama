export type SceneCount = 20 | 22 | 25 | 28 | 30;
export type SceneCountInput = SceneCount | "auto";
export type CompanionShotKind = "broll" | "transition";
export type BeatRole = "hero" | "broll" | "transition";
export type ColorGradePreset =
  | "warm-neutral documentary"
  | "neutral-cool restraint"
  | "muted realism"
  | "soft warm intimacy"
  | "storm-blue mythic"
  | "moonlit coastal tension"
  | "sunset awakening"
  | "tidal supernatural realism";

export type ProjectMode = "singapore-realism" | "coastal-fantasy-drama";

export type FilmTone =
  | "cinematic documentary"
  | "psychological drama"
  | "NGO educational"
  | "emotional realism";

export type SceneImportance = "A" | "B" | "C";
export type ScenePhase =
  | "Opening - Awareness"
  | "Understanding - Reframing"
  | "Turning Point - Action"
  | "Impact - Closing";
export type SceneType =
  | "environment"
  | "character close-up"
  | "behavior shot"
  | "symbolic insert"
  | "transition B-roll"
  | "atmospheric insert"
  | "POV shot"
  | "over-shoulder shot";

export interface UserSettings {
  projectMode?: ProjectMode;
  title?: string;
  originalScript: string;
  lockedVoiceOver?: string;
  narratorCharacter?: string;
  onScreenCharacter?: string;
  referenceTag?: string;
  sceneCount: SceneCountInput;
  style: FilmTone;
  colorGradePreset?: ColorGradePreset;
  strictMode?: boolean;
  fantasyBible?: FantasyBibleInput;
}

export interface FantasyBibleInput {
  corePremise?: string;
  heroName?: string;
  powerType?: string;
  powerLimits?: string;
  enemyType?: string;
  worldTone?: string;
  endingHook?: string;
}

export interface BeatItem {
  beatNumber: number;
  phase: ScenePhase;
  storyArc: string;
  role: BeatRole;
  importance: SceneImportance;
  voLine: string;
  purpose: string;
  visualRole: string;
  framingIntent: string;
}

export interface SceneItem {
  sceneNumber: number;
  phase: ScenePhase;
  voLine: string;
  shotType: SceneType;
  scenePurpose: string;
  importance: SceneImportance;
  useReferenceImage: boolean;
  imagePrompt: string;
  videoPrompt: string;
  camera: string;
  lightingColor: string;
  companionShots?: CompanionShot[];
}

export interface SceneMetadata {
  sceneNumber: number;
  phase: ScenePhase;
  voLine: string;
  shotType: SceneType;
  scenePurpose: string;
  importance: SceneImportance;
  useReferenceImage: boolean;
  camera: string;
  lightingColor: string;
}

export interface CompanionShot {
  id: string;
  parentSceneNumber: number;
  label: string;
  kind: CompanionShotKind;
  phase: ScenePhase;
  voLine: string;
  shotType: SceneType;
  scenePurpose: string;
  importance: SceneImportance;
  useReferenceImage: boolean;
  imagePrompt: string;
  videoPrompt: string;
  camera: string;
  lightingColor: string;
}

export interface FilmPack {
  title: string;
  style: FilmTone;
  colorGradePreset?: ColorGradePreset;
  settingNote: string;
  preservedVoiceOverScript: string;
  characterReferenceGuidance: string;
  beatSheet?: BeatItem[];
  scenes: SceneItem[];
}

export interface GenerateFilmPackRequest {
  settings: UserSettings;
  beatSheet?: BeatItem[];
}
