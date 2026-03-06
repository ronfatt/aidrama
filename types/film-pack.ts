export type SceneCount = 20 | 22 | 25;
export type SceneCountInput = SceneCount | "auto";

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
  | "POV shot"
  | "over-shoulder shot";

export interface UserSettings {
  title?: string;
  originalScript: string;
  lockedVoiceOver?: string;
  referenceTag?: string;
  sceneCount: SceneCountInput;
  style: FilmTone;
  strictMode?: boolean;
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
}

export interface FilmPack {
  title: string;
  style: FilmTone;
  settingNote: string;
  preservedVoiceOverScript: string;
  characterReferenceGuidance: string;
  scenes: SceneItem[];
}

export interface GenerateFilmPackRequest {
  settings: UserSettings;
}
