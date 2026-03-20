export type SceneCount = 20 | 22 | 25 | 28 | 30;
export type SceneCountInput = SceneCount | "auto";
export type CompanionShotKind = "broll" | "transition";
export type BeatRole = "hero" | "broll" | "transition";
export type AspectRatio = "16:9" | "9:16";
export type ColorGradePreset =
  | "warm-neutral documentary"
  | "neutral-cool restraint"
  | "muted realism"
  | "soft warm intimacy"
  | "storm-blue mythic"
  | "moonlit coastal tension"
  | "sunset awakening"
  | "tidal supernatural realism";

export type ProjectMode = "singapore-realism" | "tawau-sabah-realism" | "coastal-fantasy-drama";
export type CastRole = "lead" | "female lead" | "ally" | "antagonist" | "supporting";

export type FilmTone =
  | "cinematic documentary"
  | "psychological drama"
  | "NGO educational"
  | "emotional realism"
  | "epic cinematic fantasy"
  | "mythic supernatural drama"
  | "coastal dark fantasy";

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
export type DirectorSceneType = "action" | "dialogue" | "environment" | "emotional";
export type PairCoverageBias =
  | "speaker-listener"
  | "reverse-shot"
  | "over-shoulder-tension"
  | "cutaway-bridged";
export type DialogueCoverageRole =
  | "none"
  | "speaker"
  | "listener"
  | "over-shoulder"
  | "cutaway"
  | "return-to-speaker"
  | "silent-hold";

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
  aspectRatio?: AspectRatio;
  colorGradePreset?: ColorGradePreset;
  strictMode?: boolean;
  fantasyBible?: FantasyBibleInput;
  castBible?: CastMemberInput[];
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

export interface CastMemberInput {
  id: string;
  name: string;
  role: CastRole;
  referenceTag?: string;
  identityNote?: string;
  wardrobeNote?: string;
  masterReferenceImages?: string[];
  masterReferenceUrls?: string;
  officialMasterReference?: string | null;
}

export interface BeatItem {
  beatNumber: number;
  phase: ScenePhase;
  storyArc: string;
  shotGrammarPreset: string;
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
  onScreenCharacter?: string;
  impliedOtherCharacter?: string;
  sceneType?: DirectorSceneType;
  shotType: SceneType;
  shotGrammarPreset?: string;
  cameraStyle?: string;
  actionStyle?: string;
  motionTemplateId?: string;
  scenePurpose: string;
  importance: SceneImportance;
  useReferenceImage: boolean;
  imagePrompt: string;
  videoPrompt: string;
  camera: string;
  lightingColor: string;
  voiceScript?: string;
  lipSyncPrompt?: string;
  microActingPrompt?: string;
  reactionShotPrompt?: string;
  pairCoverageBias?: PairCoverageBias | "";
  actionSequence?: string;
  impactBeat?: string;
  enemyResponse?: string;
  aftermathShot?: string;
  establishingBeat?: string;
  cutawayPrompt?: string;
  atmosphereNote?: string;
  transitionBeat?: string;
  microTensionPrompt?: string;
  silenceBeat?: string;
  eyeLineShiftPrompt?: string;
  pullAwayShot?: string;
  companionShots?: CompanionShot[];
}

export interface SceneMetadata {
  sceneNumber: number;
  phase: ScenePhase;
  voLine: string;
  onScreenCharacter?: string;
  impliedOtherCharacter?: string;
  sceneType?: DirectorSceneType;
  shotType: SceneType;
  shotGrammarPreset?: string;
  cameraStyle?: string;
  actionStyle?: string;
  motionTemplateId?: string;
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
  dialogueCoverageRole?: DialogueCoverageRole;
  phase: ScenePhase;
  voLine: string;
  onScreenCharacter?: string;
  impliedOtherCharacter?: string;
  sceneType?: DirectorSceneType;
  shotType: SceneType;
  shotGrammarPreset?: string;
  cameraStyle?: string;
  actionStyle?: string;
  motionTemplateId?: string;
  scenePurpose: string;
  importance: SceneImportance;
  useReferenceImage: boolean;
  imagePrompt: string;
  videoPrompt: string;
  camera: string;
  lightingColor: string;
  voiceScript?: string;
  lipSyncPrompt?: string;
  microActingPrompt?: string;
  reactionShotPrompt?: string;
  pairCoverageBias?: PairCoverageBias | "";
  actionSequence?: string;
  impactBeat?: string;
  enemyResponse?: string;
  aftermathShot?: string;
  establishingBeat?: string;
  cutawayPrompt?: string;
  atmosphereNote?: string;
  transitionBeat?: string;
  microTensionPrompt?: string;
  silenceBeat?: string;
  eyeLineShiftPrompt?: string;
  pullAwayShot?: string;
}

export interface FilmPack {
  title: string;
  style: FilmTone;
  aspectRatio?: AspectRatio;
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
