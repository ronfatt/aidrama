import type { ColorGradePreset, FantasyBibleInput, FilmTone, ProjectMode, SceneCountInput } from "@/types/film-pack";

export const PROJECT_MODES: Array<{ value: ProjectMode; label: string; description: string }> = [
  {
    value: "singapore-realism",
    label: "Singapore Realism",
    description: "Grounded Singapore short-form realism, documentary-adjacent visual language.",
  },
  {
    value: "coastal-fantasy-drama",
    label: "Coastal Fantasy Drama",
    description: "Single-hero short drama with powers, mythic atmosphere, and enemy conflict.",
  },
];

export const SCENE_COUNTS: SceneCountInput[] = ["auto", 20, 22, 25, 28, 30];

export const FILM_STYLES: FilmTone[] = [
  "cinematic documentary",
  "psychological drama",
  "NGO educational",
  "emotional realism",
];

export const FANTASY_FILM_STYLES: FilmTone[] = [
  "epic cinematic fantasy",
  "mythic supernatural drama",
  "coastal dark fantasy",
];

export const COLOR_GRADE_PRESETS: ColorGradePreset[] = [
  "warm-neutral documentary",
  "neutral-cool restraint",
  "muted realism",
  "soft warm intimacy",
];

export const FANTASY_COLOR_GRADE_PRESETS: ColorGradePreset[] = [
  "storm-blue mythic",
  "moonlit coastal tension",
  "sunset awakening",
  "tidal supernatural realism",
];

export const FANTASY_LOCATION_VOCABULARY = [
  "breakwater walkway",
  "abandoned jetty",
  "shoreline rooftop",
  "storm drain channel",
  "harbour edge",
  "seawall walkway",
  "container-port horizon",
  "flooded alley",
  "rain-slick coastal underpass",
  "sea-facing housing block corridor",
] as const;

export const RULE_CHECKLIST = [
  "Preserve original meaning and keep narration around 80–90 seconds.",
  "Generate exactly selected scene count (Auto / 20 / 22 / 25 / 28 / 30).",
  "Only one clearly visible character per scene.",
  "If interaction is needed, use POV / over-shoulder / back view / silhouette.",
  "Avoid two clear faces in one scene.",
  "Only use reference-image workflow if you explicitly provide a character reference tag or master ref.",
  "All scenes in Singapore contexts (HDB, MRT, hawker, void deck, parks).",
  "No western suburban houses or American interiors.",
  "Characters should read as Singapore residents (Chinese / Malay / Indian Singaporean).",
  "Image/video prompts optimized for Kling O1 and image-to-video workflow.",
];

export const SAMPLE_SCRIPT = `Late evening in Toa Payoh. Darren returns from work and walks through the HDB void deck where he grew up. He notices an old notice board announcing a neighborhood food drive, but very few names are signed up. On the way home, he passes an elderly uncle carrying heavy grocery bags up a staircase because the lift is under maintenance. Darren helps him.

Inside his small flat, Darren scrolls social media and sees many people talking about caring for community, but the next morning he still finds the donation table at the hawker centre almost empty. He starts with one practical step: filming a short message in the corridor, asking neighbors to donate one meal item each.

At first, responses are slow. Then a Malay mother adds rice. A Chinese student adds canned food. An Indian Singaporean delivery rider leaves instant noodles before his shift. By the weekend, boxes are full and volunteers are sorting items at the void deck.

Darren realizes the story is not about one hero. It is about small actions becoming a shared rhythm. In a city that moves fast, community still grows when people decide to show up.`;

export const DEFAULT_REFERENCE_TAG = "";

export const FANTASY_SAMPLE_SCRIPT = `Kai has spent his whole life near Singapore's eastern shoreline, always hearing the sea before anyone else notices it. One stormy evening, he sees a child slip near the breakwater and reaches out on instinct. The water rises around his arm like it is answering him. He pulls the child back, but the tide does not settle. It circles his feet as if it recognizes him.

Over the next few days, strange things keep happening. Bowls of water tremble when his emotions spike. Rain gathers against the wind. Saltwater creeps across concrete drains and up stairwells without touching anyone else. Kai realizes this is not luck. Something in him is connected to the sea.

But every time he uses the power, it costs him. His body weakens. His breathing turns shallow. And at night, he begins seeing a dark figure watching from the shoreline, always just beyond the spray. Someone, or something, knows what he is becoming.

When the figure finally attacks near an abandoned jetty, Kai pushes back with the tide for the first time. The water shields him, then surges forward with frightening force. He wins the moment, but the sea does not calm. Far out in the darkness, a larger wave begins to rise on its own, as if answering a call.`;

export const FANTASY_SAMPLE_VO = `Kai always felt the sea before he understood it.

One night, when danger struck, the water answered him back.

What began as instinct became something impossible to ignore.

Every use of the power pulled more out of him.

And something in the dark was already watching.

When he finally fought back, he survived the first attack.

But the ocean had only just begun to wake.`;

export const FANTASY_SAMPLE_BIBLE: FantasyBibleInput = {
  corePremise:
    "A young Singaporean man discovers he can command the sea, but every use of his power weakens him and draws enemy forces closer to the coast.",
  heroName: "Kai",
  powerType: "control over sea currents, tidal force, and water pressure",
  powerLimits: "stronger near open water, drains stamina, unstable under fear, difficult to sustain inland",
  enemyType: "a shadowy shoreline rival tied to an older oceanic force",
  worldTone: "grounded Southeast Asian coastal fantasy with mythic ocean tension",
  endingHook: "Kai survives the first fight, but a larger force in the sea answers back and marks the start of a bigger war.",
};
