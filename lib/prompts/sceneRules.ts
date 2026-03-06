export const ALLOWED_SCENE_TYPES = [
  "environment",
  "character close-up",
  "behavior shot",
  "symbolic insert",
  "POV shot",
  "over-shoulder shot",
] as const;

export const ALLOWED_SCENE_PHASES = [
  "Opening - Awareness",
  "Understanding - Reframing",
  "Turning Point - Action",
  "Impact - Closing",
] as const;

export const IMAGE_PROMPT_SUFFIX =
  "cinematic composition, photorealistic, 35mm film still, dramatic lighting, shallow depth of field";

export const sceneRules = `
Scene generation rules:

Generate between 20 and 25 scenes.

Scene types allowed:

- environment
- character close-up
- behavior shot
- symbolic insert
- POV shot
- over-shoulder shot

Each scene must include:

- scene number
- phase (story stage)
- VO line
- shot type
- scene purpose
- scene importance (A/B/C)
- whether character reference image is used
- image prompt
- video prompt
- camera movement
- lighting and color notes

Story phase rules:
- Use all four stages in order:
  1) Opening - Awareness
  2) Understanding - Reframing
  3) Turning Point - Action
  4) Impact - Closing
- Distribute scenes across these stages progressively.

Image prompt guidelines:

Focus on a single cinematic frame.

Describe:

- subject
- environment
- emotional posture
- lighting
- cinematic composition

Avoid over describing camera parameters.

Video prompt guidelines:

Focus on subtle motion.

Include:

- micro character movement
- environmental motion
- camera movement

Avoid excessive instructions.

If the main character appears in a scene,
assume a reference image will be used.

Do not describe detailed facial features again.

Focus on:

- pose
- framing
- environment
- emotion
- lighting
`;
