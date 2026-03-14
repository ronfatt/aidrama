import type { FilmTone, ProjectMode, SceneItem, SceneMetadata } from "@/types/film-pack";

export type KlingMotionCategory =
  | "documentary"
  | "cinematic"
  | "action"
  | "drone"
  | "emotional";

export interface KlingMotionTemplate {
  id: string;
  label: string;
  category: KlingMotionCategory;
  cameraStyle: string;
  actionStyle: string;
  prompt: string;
}

const TEMPLATES: KlingMotionTemplate[] = [
  {
    id: "doc-01",
    label: "Handheld Documentary Push",
    category: "documentary",
    cameraStyle: "handheld documentary",
    actionStyle: "subtle realism",
    prompt:
      "handheld documentary shot, camera slowly pushes forward, natural shoulder movement, subtle background activity, warm neutral lighting",
  },
  {
    id: "doc-02",
    label: "Observation Drift",
    category: "documentary",
    cameraStyle: "handheld observation",
    actionStyle: "observational office",
    prompt:
      "handheld observation shot, camera gently drifting left to right, natural office ambience, realistic documentary style",
  },
  {
    id: "doc-03",
    label: "Documentary Parallax Push",
    category: "documentary",
    cameraStyle: "cinematic documentary push-in",
    actionStyle: "subtle realism",
    prompt:
      "cinematic documentary push-in, slow camera movement toward subject, subtle parallax in foreground objects",
  },
  {
    id: "doc-04",
    label: "Shoulder Documentary Framing",
    category: "documentary",
    cameraStyle: "shoulder-level documentary",
    actionStyle: "ambient observation",
    prompt:
      "shoulder-level documentary framing, camera slightly adjusting focus, ambient environment movement",
  },
  {
    id: "doc-05",
    label: "Breathing Handheld Realism",
    category: "documentary",
    cameraStyle: "soft handheld camera motion",
    actionStyle: "subtle realism",
    prompt:
      "soft handheld camera motion, natural breathing movement, environmental realism",
  },
  {
    id: "doc-06",
    label: "Corridor Tracking",
    category: "documentary",
    cameraStyle: "documentary tracking shot",
    actionStyle: "walking realism",
    prompt:
      "documentary tracking shot following subject walking through office corridor",
  },
  {
    id: "doc-07",
    label: "Environmental Drift",
    category: "documentary",
    cameraStyle: "wide environmental documentary",
    actionStyle: "ambient realism",
    prompt: "wide environmental documentary shot, slow drifting camera movement",
  },
  {
    id: "doc-08",
    label: "Observation Sway",
    category: "documentary",
    cameraStyle: "natural observation camera",
    actionStyle: "quiet realism",
    prompt: "natural observation camera style, subtle camera sway",
  },
  {
    id: "doc-09",
    label: "Interface Zoom-In",
    category: "documentary",
    cameraStyle: "documentary zoom-in",
    actionStyle: "device interaction",
    prompt:
      "cinematic documentary zoom-in toward subject interacting with device",
  },
  {
    id: "doc-10",
    label: "Quiet Public Service Observe",
    category: "documentary",
    cameraStyle: "quiet observational camera",
    actionStyle: "public service realism",
    prompt:
      "quiet observational camera, minimal handheld motion, realistic public service environment",
  },
  {
    id: "cine-11",
    label: "Cinematic Push-In",
    category: "cinematic",
    cameraStyle: "cinematic push-in shot",
    actionStyle: "dramatic focus",
    prompt:
      "cinematic push-in shot, camera slowly moving forward toward subject, shallow depth of field, dramatic lighting",
  },
  {
    id: "cine-12",
    label: "Side Tracking Pass",
    category: "cinematic",
    cameraStyle: "cinematic tracking shot",
    actionStyle: "layered movement",
    prompt:
      "cinematic tracking shot moving sideways, foreground objects passing the frame",
  },
  {
    id: "cine-13",
    label: "Dramatic Face Zoom",
    category: "cinematic",
    cameraStyle: "dramatic slow zoom",
    actionStyle: "emotional pressure",
    prompt:
      "dramatic slow zoom toward the character's face, intense cinematic lighting",
  },
  {
    id: "cine-14",
    label: "Wide Reveal Establishing",
    category: "cinematic",
    cameraStyle: "wide cinematic establishing shot",
    actionStyle: "environment reveal",
    prompt:
      "wide cinematic establishing shot, slow drone-like camera movement across the scene",
  },
  {
    id: "cine-15",
    label: "Low Angle Hero Rise",
    category: "cinematic",
    cameraStyle: "low-angle hero shot",
    actionStyle: "heroic emergence",
    prompt:
      "low-angle hero shot, camera slowly rising upward toward the character",
  },
  {
    id: "cine-16",
    label: "Forward Dolly Through Space",
    category: "cinematic",
    cameraStyle: "cinematic dolly shot",
    actionStyle: "immersive approach",
    prompt:
      "cinematic dolly shot moving forward through environment",
  },
  {
    id: "cine-17",
    label: "Slow Orbit",
    category: "cinematic",
    cameraStyle: "slow cinematic orbit",
    actionStyle: "subject emphasis",
    prompt: "slow cinematic orbit around the subject",
  },
  {
    id: "cine-18",
    label: "Pullback Reveal",
    category: "cinematic",
    cameraStyle: "epic cinematic reveal",
    actionStyle: "world expansion",
    prompt:
      "epic cinematic reveal shot, camera pulling backward to reveal large environment",
  },
  {
    id: "cine-19",
    label: "Shaken Close Push",
    category: "cinematic",
    cameraStyle: "dramatic close-up push-in",
    actionStyle: "tension beat",
    prompt:
      "dramatic close-up push-in with subtle camera shake",
  },
  {
    id: "cine-20",
    label: "Glide Through Space",
    category: "cinematic",
    cameraStyle: "cinematic glide shot",
    actionStyle: "immersive travel",
    prompt:
      "cinematic glide shot through environment, immersive depth",
  },
  {
    id: "act-21",
    label: "Hero Charge",
    category: "action",
    cameraStyle: "rapid push-in",
    actionStyle: "heroic action",
    prompt:
      "hero suddenly charges forward, camera rapidly pushes in, dynamic motion blur",
  },
  {
    id: "act-22",
    label: "Forward Action Track",
    category: "action",
    cameraStyle: "fast action tracking shot",
    actionStyle: "running pursuit",
    prompt:
      "fast action tracking shot following the hero running forward",
  },
  {
    id: "act-23",
    label: "Leap Follow Tilt",
    category: "action",
    cameraStyle: "upward tilt follow",
    actionStyle: "airborne attack",
    prompt:
      "combat motion, character leaps into the air, camera tilts upward following the movement",
  },
  {
    id: "act-24",
    label: "Impact Slow Motion",
    category: "action",
    cameraStyle: "impact slow motion",
    actionStyle: "collision beat",
    prompt:
      "dramatic impact moment, slow motion collision, particles flying",
  },
  {
    id: "act-25",
    label: "Combat Circle",
    category: "action",
    cameraStyle: "rapid combat orbit",
    actionStyle: "fight escalation",
    prompt:
      "dynamic combat scene, camera circling around fighters rapidly",
  },
  {
    id: "act-26",
    label: "Enemy Confrontation Push",
    category: "action",
    cameraStyle: "rapid confrontation push-in",
    actionStyle: "conflict impact",
    prompt:
      "rapid push-in toward enemy confrontation, cinematic impact",
  },
  {
    id: "act-27",
    label: "Landing Debris Beat",
    category: "action",
    cameraStyle: "impact landing frame",
    actionStyle: "hero landing",
    prompt:
      "hero landing from jump, dust and debris spreading",
  },
  {
    id: "act-28",
    label: "Battlefield Handheld",
    category: "action",
    cameraStyle: "fast handheld combat camera",
    actionStyle: "battle intensity",
    prompt:
      "fast handheld combat camera, intense battlefield energy",
  },
  {
    id: "act-29",
    label: "Slow Motion Strike",
    category: "action",
    cameraStyle: "slow motion hero strike",
    actionStyle: "heroic impact",
    prompt:
      "slow motion hero strike, dramatic cinematic lighting",
  },
  {
    id: "act-30",
    label: "Rotating Combat Center",
    category: "action",
    cameraStyle: "epic fight rotation",
    actionStyle: "combat centerpiece",
    prompt:
      "epic fight moment, camera rotating around combat center",
  },
  {
    id: "drone-31",
    label: "City Skyline Aerial",
    category: "drone",
    cameraStyle: "aerial drone shot",
    actionStyle: "city reveal",
    prompt: "aerial drone shot flying above the city skyline",
  },
  {
    id: "drone-32",
    label: "Ocean Sweep",
    category: "drone",
    cameraStyle: "wide aerial sweep",
    actionStyle: "ocean scale",
    prompt: "wide aerial sweep across ocean waves",
  },
  {
    id: "drone-33",
    label: "Coast Descent",
    category: "drone",
    cameraStyle: "descending drone",
    actionStyle: "coast approach",
    prompt: "drone slowly descending toward the coastline",
  },
  {
    id: "drone-34",
    label: "Massive Landscape Reveal",
    category: "drone",
    cameraStyle: "epic aerial reveal",
    actionStyle: "landscape scale",
    prompt: "epic aerial view revealing massive landscape",
  },
  {
    id: "drone-35",
    label: "Cloud Flythrough",
    category: "drone",
    cameraStyle: "flying camera",
    actionStyle: "mythic approach",
    prompt: "flying camera passing through clouds toward mountains",
  },
  {
    id: "drone-36",
    label: "Island Orbit",
    category: "drone",
    cameraStyle: "drone orbit",
    actionStyle: "environment showcase",
    prompt: "drone orbiting around island landscape",
  },
  {
    id: "drone-37",
    label: "Future City Flythrough",
    category: "drone",
    cameraStyle: "wide cinematic fly-through",
    actionStyle: "large-scale movement",
    prompt: "wide cinematic fly-through across futuristic city",
  },
  {
    id: "drone-38",
    label: "Jungle Glide",
    category: "drone",
    cameraStyle: "aerial camera glide",
    actionStyle: "terrain discovery",
    prompt: "aerial camera gliding over jungle canopy",
  },
  {
    id: "drone-39",
    label: "Harbor Reveal",
    category: "drone",
    cameraStyle: "slow aerial reveal",
    actionStyle: "working harbor life",
    prompt: "slow aerial reveal of harbor and fishing boats",
  },
  {
    id: "drone-40",
    label: "Coastal Village Sunset Sweep",
    category: "drone",
    cameraStyle: "drone sunset sweep",
    actionStyle: "village atmosphere",
    prompt: "drone sweeping above coastal village at sunset",
  },
  {
    id: "emo-41",
    label: "Emotional Push-In",
    category: "emotional",
    cameraStyle: "slow cinematic push-in",
    actionStyle: "emotional focus",
    prompt: "slow cinematic push-in toward emotional character moment",
  },
  {
    id: "emo-42",
    label: "Dramatic Close-Up",
    category: "emotional",
    cameraStyle: "dramatic close-up",
    actionStyle: "still emotional pressure",
    prompt: "dramatic close-up with shallow depth of field",
  },
  {
    id: "emo-43",
    label: "Reflection Orbit",
    category: "emotional",
    cameraStyle: "slow orbit camera",
    actionStyle: "reflective pause",
    prompt: "slow orbit camera capturing character reflection",
  },
  {
    id: "emo-44",
    label: "Gentle Drift",
    category: "emotional",
    cameraStyle: "gentle camera drift",
    actionStyle: "stillness with tension",
    prompt: "gentle camera drift around character standing still",
  },
  {
    id: "emo-45",
    label: "Eye-Line Zoom",
    category: "emotional",
    cameraStyle: "soft cinematic zoom-in",
    actionStyle: "eye-focus tension",
    prompt: "soft cinematic zoom-in toward eyes",
  },
  {
    id: "emo-46",
    label: "Melancholic Push",
    category: "emotional",
    cameraStyle: "melancholic slow camera push",
    actionStyle: "interior sadness",
    prompt: "melancholic slow camera push with background blur",
  },
  {
    id: "emo-47",
    label: "Backlight Silhouette",
    category: "emotional",
    cameraStyle: "cinematic backlight silhouette shot",
    actionStyle: "identity concealment",
    prompt: "cinematic backlight silhouette shot",
  },
  {
    id: "emo-48",
    label: "Wind Pause",
    category: "emotional",
    cameraStyle: "dramatic pause shot",
    actionStyle: "suspended emotion",
    prompt: "dramatic pause moment, slow motion wind movement",
  },
  {
    id: "emo-49",
    label: "Pull Away",
    category: "emotional",
    cameraStyle: "slow pull-away",
    actionStyle: "loneliness beat",
    prompt: "camera slowly pulling away from character",
  },
  {
    id: "emo-50",
    label: "Stillness Breathing",
    category: "emotional",
    cameraStyle: "quiet cinematic stillness",
    actionStyle: "subtle realism",
    prompt: "quiet cinematic stillness, subtle camera breathing motion",
  },
];

export function getKlingMotionTemplates() {
  return TEMPLATES;
}

type MotionScene = Pick<
  SceneMetadata | SceneItem,
  "sceneNumber" | "shotType" | "shotGrammarPreset" | "scenePurpose" | "camera" | "lightingColor"
>;

export function pickKlingMotionTemplate({
  scene,
  projectMode,
  style,
}: {
  scene: MotionScene;
  projectMode: ProjectMode;
  style: FilmTone;
}) {
  const text = [
    scene.shotType,
    scene.shotGrammarPreset || "",
    scene.scenePurpose,
    scene.camera,
    scene.lightingColor,
    style,
    projectMode,
  ]
    .join(" ")
    .toLowerCase();

  let category: KlingMotionCategory;

  if (
    /combat|fight|enemy|impact|threat|power reveal|unstable power|charged pursuit|backlash|hero/.test(text) &&
    projectMode === "coastal-fantasy-drama"
  ) {
    category = "action";
  } else if (
    /aerial|harbour|harbor|ocean|coast|shore|jetty|breakwater|establishing|landscape|wide isolation|environment reveal/.test(
      text
    )
  ) {
    category = "drone";
  } else if (
    /municipal|office|device|dashboard|report|counter|documentary|public service|observation|corridor/.test(text) &&
    projectMode !== "coastal-fantasy-drama"
  ) {
    category = "documentary";
  } else if (
    /close|emotion|reflection|silhouette|melancholic|pause|stillness|eyes|vulnerable|intimate/.test(text)
  ) {
    category = "emotional";
  } else {
    category = "cinematic";
  }

  const candidates = TEMPLATES.filter((template) => template.category === category);
  return candidates[scene.sceneNumber % candidates.length] || TEMPLATES[0];
}

export function buildStructuredVideoPrompt({
  basePrompt,
  scenePurpose,
  cameraMovement,
  atmosphere,
}: {
  basePrompt: string;
  scenePurpose: string;
  cameraMovement: string;
  atmosphere: string;
}) {
  return `Scene: ${scenePurpose}. Subject: ${basePrompt}. Action Timeline: first the subject settles into the beat, then the key movement or reaction plays out, finally the frame resolves on the emotional or narrative turn. Camera Movement: ${cameraMovement}. Atmosphere: ${atmosphere}.`;
}
