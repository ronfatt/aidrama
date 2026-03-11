import type { BeatItem, FilmPack, SceneItem } from "@/types/film-pack";

export function buildSettingNote(style: string) {
  return `All scenes are set in contemporary Singapore heartland spaces: HDB flats, corridors, void decks, MRT, hawker centres, neighbourhood parks and small apartments. Visual tone is ${style}, grounded in local textures and documentary realism.`;
}

export function buildCharacterReferenceGuidance({
  referenceTag,
  onScreenCharacter,
  narratorCharacter,
}: {
  referenceTag: string;
  onScreenCharacter?: string;
  narratorCharacter?: string;
}) {
  if (!referenceTag) {
    return "No character reference workflow is active for this film pack.";
  }

  const subject = onScreenCharacter?.trim() || "the main on-screen character";
  const narratorNote =
    narratorCharacter?.trim() && narratorCharacter.trim() !== subject
      ? ` Keep ${narratorCharacter.trim()} mainly as POV, over-shoulder, back view, silhouette, or off-screen presence when needed.`
      : "";

  return `Use ${referenceTag} consistently whenever ${subject} appears. Do not redefine facial identity; focus on pose, framing, environment, wardrobe variation, mood, and lighting.${narratorNote}`;
}

export function assembleFilmPackFromScenes({
  scenes,
  beatSheet,
  settings,
  lockedVoiceOver,
  referenceTag,
}: {
  scenes: SceneItem[];
  beatSheet: BeatItem[];
  settings: {
    title?: string;
    style: FilmPack["style"];
    colorGradePreset?: FilmPack["colorGradePreset"];
    narratorCharacter?: string;
    onScreenCharacter?: string;
  };
  lockedVoiceOver: string;
  referenceTag: string;
}): FilmPack {
  return {
    title: settings.title?.trim() || "Untitled Film Pack",
    style: settings.style,
    colorGradePreset: settings.colorGradePreset,
    settingNote: buildSettingNote(settings.style),
    preservedVoiceOverScript: lockedVoiceOver || beatSheet.map((beat) => beat.voLine).join(" "),
    characterReferenceGuidance: buildCharacterReferenceGuidance({
      referenceTag,
      onScreenCharacter: settings.onScreenCharacter,
      narratorCharacter: settings.narratorCharacter,
    }),
    beatSheet,
    scenes,
  };
}
