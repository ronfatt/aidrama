import { FANTASY_LOCATION_VOCABULARY, TAWAU_LOCATION_VOCABULARY } from "@/lib/constants";
import type {
  AspectRatio,
  BeatItem,
  CastMemberInput,
  EpisodeHeaderInput,
  FantasyBibleInput,
  FilmPack,
  ProjectMode,
  SceneItem,
} from "@/types/film-pack";

export function buildSettingNote(style: string, projectMode: ProjectMode, fantasyBible?: FantasyBibleInput) {
  if (projectMode === "coastal-fantasy-drama") {
    const worldTone = fantasyBible?.worldTone?.trim() || "grounded coastal fantasy";
    const powerType = fantasyBible?.powerType?.trim() || "ocean-linked supernatural force";
    return `All scenes are set in a modern Southeast Asian coastal fantasy world with grounded urban textures, wet concrete, sea-facing edges, and controlled mythic atmosphere. Use a recurring coastal location family such as ${FANTASY_LOCATION_VOCABULARY.slice(0, 6).join(", ")}. Visual tone is ${style}, shaped by ${worldTone} and a restrained cinematic treatment of ${powerType}.`;
  }

  if (projectMode === "tawau-sabah-realism") {
    return `All scenes are set in Tawau, Sabah civic and neighborhood spaces with a more contemporary visual bias: modern municipal offices, cleaner service counters, refreshed shopfront rows, upgraded public roadsides, maintained jetties, renovated kampung air walkways, housing frontages, schools, clinics, and organized service depots. Use a recurring Tawau location family such as ${TAWAU_LOCATION_VOCABULARY.slice(0, 6).join(", ")}. Visual tone is ${style}, grounded in local realism but favoring current, well-kept, more modern architecture, clean lines, realistic daylight, and contemporary municipal color contrast. Avoid decayed, derelict, retro, or overly weathered buildings unless the script explicitly requires them.`;
  }

  return `All scenes are set in contemporary Singapore heartland spaces: HDB flats, corridors, void decks, MRT, hawker centres, neighbourhood parks and small apartments. Visual tone is ${style}, grounded in local textures and documentary realism.`;
}

export function buildCharacterReferenceGuidance({
  referenceTag,
  onScreenCharacter,
  narratorCharacter,
  projectMode,
  fantasyBible,
  castBible,
}: {
  referenceTag: string;
  onScreenCharacter?: string;
  narratorCharacter?: string;
  projectMode: ProjectMode;
  fantasyBible?: FantasyBibleInput;
  castBible?: Array<Pick<CastMemberInput, "name" | "role" | "referenceTag" | "identityNote" | "wardrobeNote">>;
}) {
  if (!referenceTag) {
    return "No character reference workflow is active for this film pack.";
  }

  const subject = onScreenCharacter?.trim() || "the main on-screen character";
  const narratorNote =
    narratorCharacter?.trim() && narratorCharacter.trim() !== subject
      ? ` Keep ${narratorCharacter.trim()} mainly as POV, over-shoulder, back view, silhouette, or off-screen presence when needed.`
      : "";
  const fantasyNote =
    projectMode === "coastal-fantasy-drama"
      ? ` Keep ${subject} consistent across ordinary-life scenes, power-awakening scenes, and threat-response scenes. Reflect ${fantasyBible?.powerType?.trim() || "the hero's powers"} through pose, water interaction, wardrobe continuity, atmosphere, and lighting rather than changing facial identity.`
      : "";
  const castNote = castBible?.length
    ? ` Recurring cast in this project: ${castBible.map((character) => `${character.name} (${character.role})`).join(", ")}. Keep scenes centered on one clear on-screen subject at a time and imply additional characters through over-shoulder, back view, silhouette, reflection, doorway separation, or cutaways.`
    : "";

  return `Use ${referenceTag} consistently whenever ${subject} appears. Do not redefine facial identity; focus on pose, framing, environment, wardrobe variation, mood, and lighting.${fantasyNote}${narratorNote}${castNote}`;
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
    projectMode?: ProjectMode;
    title?: string;
    style: FilmPack["style"];
    aspectRatio?: AspectRatio;
    colorGradePreset?: FilmPack["colorGradePreset"];
    episodeHeader?: EpisodeHeaderInput;
    narratorCharacter?: string;
    onScreenCharacter?: string;
    fantasyBible?: FantasyBibleInput;
    castBible?: Array<Pick<CastMemberInput, "name" | "role" | "referenceTag" | "identityNote" | "wardrobeNote">>;
  };
  lockedVoiceOver: string;
  referenceTag: string;
}): FilmPack {
  const projectMode = settings.projectMode || "singapore-realism";
  return {
    title: settings.title?.trim() || "Untitled Film Pack",
    style: settings.style,
    aspectRatio: settings.aspectRatio,
    colorGradePreset: settings.colorGradePreset,
    episodeHeader: settings.episodeHeader,
    castBible: settings.castBible,
    settingNote: buildSettingNote(settings.style, projectMode, settings.fantasyBible),
    preservedVoiceOverScript: lockedVoiceOver || beatSheet.map((beat) => beat.voLine).join(" "),
    characterReferenceGuidance: buildCharacterReferenceGuidance({
      referenceTag,
      onScreenCharacter: settings.onScreenCharacter,
      narratorCharacter: settings.narratorCharacter,
      projectMode,
      fantasyBible: settings.fantasyBible,
      castBible: settings.castBible,
    }),
    beatSheet,
    scenes,
  };
}
