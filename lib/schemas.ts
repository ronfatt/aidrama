import { z } from "zod";

const sceneCountSchema = z.union([z.literal(20), z.literal(22), z.literal(25)]);

const styleSchema = z.union([
  z.literal("cinematic documentary"),
  z.literal("psychological drama"),
  z.literal("NGO educational"),
  z.literal("emotional realism"),
]);

export const generateRequestSchema = z.object({
  settings: z.object({
    title: z.string().trim().max(120).optional(),
    originalScript: z.string().trim().min(20, "Script is too short.").max(10000),
    lockedVoiceOver: z.string().trim().min(20).max(10000).optional().or(z.literal("")),
    referenceTag: z
      .string()
      .trim()
      .max(50)
      .regex(/^\[[A-Z0-9_]+\]$/i, "Reference tag must look like [DARREN_REF].")
      .optional()
      .or(z.literal("")),
    sceneCount: sceneCountSchema,
    style: styleSchema,
    strictMode: z.boolean().optional(),
  }),
  strict_mode: z.boolean().optional(),
});

export const sceneItemSchema = z.object({
  sceneNumber: z.number().int().positive(),
  voLine: z.string().min(1),
  shotType: z.string().min(1),
  scenePurpose: z.string().min(1),
  importance: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
  useReferenceImage: z.boolean(),
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  camera: z.string().min(1),
  lightingColor: z.string().min(1),
});

export const filmPackSchema = z.object({
  title: z.string().min(1),
  style: styleSchema,
  settingNote: z.string().min(1),
  preservedVoiceOverScript: z.string().min(1),
  characterReferenceGuidance: z.string().min(1),
  scenes: z.array(sceneItemSchema).min(20).max(25),
});
