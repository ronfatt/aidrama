import type { BeatItem, BeatRole, SceneCount, SceneImportance, ScenePhase } from "@/types/film-pack";

const ROLE_MAP: Record<string, BeatRole> = {
  hero: "hero",
  main: "hero",
  primary: "hero",
  broll: "broll",
  "b-roll": "broll",
  transition: "transition",
  insert: "broll",
};

const PHASE_MAP: Record<string, ScenePhase> = {
  "opening - awareness": "Opening - Awareness",
  opening: "Opening - Awareness",
  awareness: "Opening - Awareness",
  "understanding - reframing": "Understanding - Reframing",
  understanding: "Understanding - Reframing",
  reframing: "Understanding - Reframing",
  "turning point - action": "Turning Point - Action",
  "turning point": "Turning Point - Action",
  action: "Turning Point - Action",
  "impact - closing": "Impact - Closing",
  impact: "Impact - Closing",
  closing: "Impact - Closing",
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function phaseByPosition(index: number, total: number): ScenePhase {
  const ratio = total <= 1 ? 1 : index / (total - 1);
  if (ratio < 0.25) return "Opening - Awareness";
  if (ratio < 0.5) return "Understanding - Reframing";
  if (ratio < 0.75) return "Turning Point - Action";
  return "Impact - Closing";
}

function normalizeRole(role: string | undefined): BeatRole {
  const normalized = normalizeWhitespace(role || "").toLowerCase();
  return ROLE_MAP[normalized] || "hero";
}

function normalizeImportance(input: string | undefined, role: BeatRole): SceneImportance {
  const normalized = normalizeWhitespace(input || "").toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C") {
    return normalized;
  }
  return role === "hero" ? "A" : role === "transition" ? "C" : "B";
}

function normalizePhase(phase: string | undefined, index: number, total: number): ScenePhase {
  const normalized = normalizeWhitespace(phase || "").toLowerCase();
  return PHASE_MAP[normalized] || phaseByPosition(index, total);
}

function minimumNonHeroCount(sceneCount: number): number {
  return sceneCount >= 25 ? 5 : 4;
}

const HERO_VISUAL_ROLES = [
  "hero portrait",
  "wide isolation",
  "over-shoulder witness",
  "back-view withdrawal",
  "threshold composition",
  "reflection frame",
] as const;

const NON_HERO_VISUAL_ROLES = [
  "environment bridge",
  "object metaphor",
  "negative space pause",
  "symbolic insert",
  "architectural transition",
] as const;

const HERO_FRAMING_INTENTS = [
  "intimate close portrait",
  "environmental distance",
  "observer over-shoulder",
  "back-view emotional withdrawal",
  "doorway threshold frame",
  "reflection composition",
] as const;

const NON_HERO_FRAMING_INTENTS = [
  "negative space frame",
  "object detail insert",
  "corridor transition frame",
  "architectural wide",
  "hands and gesture detail",
] as const;

function rebalanceBeatRoles(beats: BeatItem[]): BeatItem[] {
  const updated = [...beats];
  const currentNonHero = updated.filter((beat) => beat.role !== "hero").length;
  const needed = minimumNonHeroCount(updated.length) - currentNonHero;

  if (needed <= 0) {
    return updated;
  }

  let remaining = needed;
  for (let index = 0; index < updated.length && remaining > 0; index += 1) {
    const beat = updated[index];
    if (beat.role !== "hero" || beat.importance === "A") {
      continue;
    }

    const nextRole: BeatRole = remaining % 2 === 0 ? "transition" : "broll";
    updated[index] = {
      ...beat,
      role: nextRole,
      importance: nextRole === "transition" ? "C" : "B",
      purpose:
        nextRole === "transition"
          ? `Transition beat: ${beat.purpose}`
          : `B-roll beat: ${beat.purpose}`,
    };
    remaining -= 1;
  }

  return updated;
}

function deriveVisualRole(role: BeatRole, index: number): string {
  const source = role === "hero" ? HERO_VISUAL_ROLES : NON_HERO_VISUAL_ROLES;
  return source[index % source.length];
}

function deriveFramingIntent(role: BeatRole, index: number): string {
  const source = role === "hero" ? HERO_FRAMING_INTENTS : NON_HERO_FRAMING_INTENTS;
  return source[index % source.length];
}

function diversifyBeatVisuals(beats: BeatItem[]): BeatItem[] {
  return beats.map((beat, index) => {
    const previous = index > 0 ? beats[index - 1] : null;
    let framingIntent = normalizeWhitespace(beat.framingIntent || "") || deriveFramingIntent(beat.role, index);

    if (previous && previous.framingIntent === framingIntent) {
      framingIntent = deriveFramingIntent(beat.role, index + 1);
    }

    return {
      ...beat,
      visualRole: normalizeWhitespace(beat.visualRole || "") || deriveVisualRole(beat.role, index),
      framingIntent,
    };
  });
}

export function normalizeBeatSheet(
  rawBeats: Array<{
    beatNumber?: number;
    phase?: string;
    role?: string;
    importance?: string;
    voLine?: string;
    purpose?: string;
    visualRole?: string;
    framingIntent?: string;
  }>,
  sceneCount: SceneCount
): BeatItem[] {
  const normalized = rawBeats.slice(0, sceneCount).map((beat, index): BeatItem => {
    const role = normalizeRole(typeof beat.role === "string" ? beat.role : undefined);
    return {
      beatNumber: index + 1,
      phase: normalizePhase(typeof beat.phase === "string" ? beat.phase : undefined, index, sceneCount),
      role,
      importance: normalizeImportance(typeof beat.importance === "string" ? beat.importance : undefined, role),
      voLine: normalizeWhitespace(beat.voLine || ""),
      purpose: normalizeWhitespace(beat.purpose || "Cover this story moment clearly and concisely."),
      visualRole: normalizeWhitespace(beat.visualRole || "") || deriveVisualRole(role, index),
      framingIntent: normalizeWhitespace(beat.framingIntent || "") || deriveFramingIntent(role, index),
    };
  });

  return diversifyBeatVisuals(rebalanceBeatRoles(normalized));
}
