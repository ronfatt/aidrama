import type { FilmTone, SceneCountInput } from "@/types/film-pack";

export const SCENE_COUNTS: SceneCountInput[] = ["auto", 20, 22, 25];

export const FILM_STYLES: FilmTone[] = [
  "cinematic documentary",
  "psychological drama",
  "NGO educational",
  "emotional realism",
];

export const RULE_CHECKLIST = [
  "Preserve original meaning and keep narration around 80–90 seconds.",
  "Generate exactly selected scene count (Auto / 20 / 22 / 25).",
  "Only one clearly visible character per scene.",
  "If interaction is needed, use POV / over-shoulder / back view / silhouette.",
  "Avoid two clear faces in one scene.",
  "Mark scenes with main character as reference image = yes.",
  "All scenes in Singapore contexts (HDB, MRT, hawker, void deck, parks).",
  "No western suburban houses or American interiors.",
  "Characters should read as Singapore residents (Chinese / Malay / Indian Singaporean).",
  "Image/video prompts optimized for Kling O1 and image-to-video workflow.",
];

export const SAMPLE_SCRIPT = `Late evening in Toa Payoh. Darren returns from work and walks through the HDB void deck where he grew up. He notices an old notice board announcing a neighborhood food drive, but very few names are signed up. On the way home, he passes an elderly uncle carrying heavy grocery bags up a staircase because the lift is under maintenance. Darren helps him.

Inside his small flat, Darren scrolls social media and sees many people talking about caring for community, but the next morning he still finds the donation table at the hawker centre almost empty. He starts with one practical step: filming a short message in the corridor, asking neighbors to donate one meal item each.

At first, responses are slow. Then a Malay mother adds rice. A Chinese student adds canned food. An Indian Singaporean delivery rider leaves instant noodles before his shift. By the weekend, boxes are full and volunteers are sorting items at the void deck.

Darren realizes the story is not about one hero. It is about small actions becoming a shared rhythm. In a city that moves fast, community still grows when people decide to show up.`;

export const DEFAULT_REFERENCE_TAG = "[DARREN_REF]";
