import { z } from "zod";
import { normalizeReferenceTag } from "@/lib/reference-tag";

const sceneCountSchema = z.union([
  z.literal("auto"),
  z.literal(20),
  z.literal(22),
  z.literal(25),
  z.literal(28),
  z.literal(30),
]);

const projectModeSchema = z.union([
  z.literal("singapore-realism"),
  z.literal("tawau-sabah-realism"),
  z.literal("coastal-fantasy-drama"),
]);

const styleSchema = z.union([
  z.literal("cinematic documentary"),
  z.literal("psychological drama"),
  z.literal("NGO educational"),
  z.literal("emotional realism"),
  z.literal("epic cinematic fantasy"),
  z.literal("mythic supernatural drama"),
  z.literal("coastal dark fantasy"),
]);

const colorGradePresetSchema = z.union([
  z.literal("warm-neutral documentary"),
  z.literal("neutral-cool restraint"),
  z.literal("muted realism"),
  z.literal("soft warm intimacy"),
  z.literal("storm-blue mythic"),
  z.literal("moonlit coastal tension"),
  z.literal("sunset awakening"),
  z.literal("tidal supernatural realism"),
]);

const aspectRatioSchema = z.union([z.literal("16:9"), z.literal("9:16")]);

const phaseSchema = z.union([
  z.literal("Opening - Awareness"),
  z.literal("Understanding - Reframing"),
  z.literal("Turning Point - Action"),
  z.literal("Impact - Closing"),
]);

const beatRoleSchema = z.union([z.literal("hero"), z.literal("broll"), z.literal("transition")]);

export const beatItemSchema = z.object({
  beatNumber: z.number().int().positive(),
  phase: phaseSchema,
  storyArc: z.string().min(1),
  shotGrammarPreset: z.string().min(1),
  role: beatRoleSchema,
  importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
  voLine: z.string().min(1),
  purpose: z.string().min(1),
  visualRole: z.string().min(1),
  framingIntent: z.string().min(1),
});

export const generateRequestSchema = z.object({
  settings: z.object({
    projectMode: projectModeSchema.optional(),
    title: z.string().trim().max(120).optional(),
    originalScript: z.string().trim().min(20, "Script is too short.").max(10000),
    lockedVoiceOver: z.string().trim().min(20).max(10000).optional().or(z.literal("")),
    narratorCharacter: z.string().trim().max(80).optional().or(z.literal("")),
    onScreenCharacter: z.string().trim().max(80).optional().or(z.literal("")),
    referenceTag: z
      .string()
      .max(50)
      .transform((value) => normalizeReferenceTag(value))
      .refine((value) => value === "" || /^\[[A-Z0-9_]+\]$/.test(value), "Reference tag format is invalid.")
      .optional()
      .or(z.literal("")),
    sceneCount: sceneCountSchema,
    style: styleSchema,
    aspectRatio: aspectRatioSchema.optional(),
    colorGradePreset: colorGradePresetSchema.optional(),
    strictMode: z.boolean().optional(),
    fantasyBible: z
      .object({
        corePremise: z.string().trim().max(1000).optional().or(z.literal("")),
        heroName: z.string().trim().max(120).optional().or(z.literal("")),
        powerType: z.string().trim().max(300).optional().or(z.literal("")),
        powerLimits: z.string().trim().max(500).optional().or(z.literal("")),
        enemyType: z.string().trim().max(300).optional().or(z.literal("")),
        worldTone: z.string().trim().max(300).optional().or(z.literal("")),
        endingHook: z.string().trim().max(500).optional().or(z.literal("")),
      })
      .optional(),
  }),
  beatSheet: z.array(beatItemSchema).min(1).max(30).optional(),
  strict_mode: z.boolean().optional(),
});

export const sceneItemSchema = z.object({
  sceneNumber: z.number().int().positive(),
  phase: z.string().optional().or(z.literal("")),
  voLine: z.string().min(1),
  sceneType: z.union([z.literal("action"), z.literal("dialogue"), z.literal("environment"), z.literal("emotional")]).optional(),
  shotType: z.string().min(1),
  shotGrammarPreset: z.string().optional().or(z.literal("")),
  cameraStyle: z.string().optional().or(z.literal("")),
  actionStyle: z.string().optional().or(z.literal("")),
  motionTemplateId: z.string().optional().or(z.literal("")),
  scenePurpose: z.string().min(1),
  importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
  useReferenceImage: z.boolean(),
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  camera: z.string().min(1),
  lightingColor: z.string().min(1),
  voiceScript: z.string().optional().or(z.literal("")),
  lipSyncPrompt: z.string().optional().or(z.literal("")),
  microActingPrompt: z.string().optional().or(z.literal("")),
  reactionShotPrompt: z.string().optional().or(z.literal("")),
  actionSequence: z.string().optional().or(z.literal("")),
  impactBeat: z.string().optional().or(z.literal("")),
  enemyResponse: z.string().optional().or(z.literal("")),
  aftermathShot: z.string().optional().or(z.literal("")),
  establishingBeat: z.string().optional().or(z.literal("")),
  cutawayPrompt: z.string().optional().or(z.literal("")),
  atmosphereNote: z.string().optional().or(z.literal("")),
  transitionBeat: z.string().optional().or(z.literal("")),
  microTensionPrompt: z.string().optional().or(z.literal("")),
  silenceBeat: z.string().optional().or(z.literal("")),
  eyeLineShiftPrompt: z.string().optional().or(z.literal("")),
  pullAwayShot: z.string().optional().or(z.literal("")),
});

export const filmPackSchema = z.object({
  title: z.string().min(1),
  style: styleSchema,
  settingNote: z.string().min(1),
  preservedVoiceOverScript: z.string().min(1),
  characterReferenceGuidance: z.string().min(1),
  scenes: z.array(sceneItemSchema).min(20).max(30),
});
