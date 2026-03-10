"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { RulesPanel } from "@/components/rules-panel";
import { SceneCard } from "@/components/scene-card";
import {
  COLOR_GRADE_PRESETS,
  DEFAULT_REFERENCE_TAG,
  FILM_STYLES,
  SAMPLE_SCRIPT,
  SCENE_COUNTS,
} from "@/lib/constants";
import { fullOutputCopy, toFilmPackMarkdown, toFilmPackText } from "@/lib/formatters";
import { normalizeReferenceTag } from "@/lib/reference-tag";
import type {
  BeatItem,
  ColorGradePreset,
  CompanionShot,
  FilmPack,
  FilmTone,
  SceneCountInput,
  SceneItem,
} from "@/types/film-pack";

interface GenerateResponse {
  filmPack: FilmPack;
}

interface GenerateBeatSheetResponse {
  beatSheet: BeatItem[];
  sceneCount: number;
}

interface GenerateCompanionShotPayload {
  shot?: CompanionShot;
  error?: string;
}

interface GenerateImageResponse {
  imageDataUrl?: string;
  error?: string;
  taskId?: string;
  status?: "submitted" | "processing" | "succeeded" | "failed";
  provider?: "gemini" | "kling";
  fallbackFrom?: "gemini" | "kling";
  modelUsed?: string;
}

interface SavedFilmPackRecord {
  id: string;
  title: string;
  style: FilmTone;
  sceneCount: number;
  createdAt: string;
  filmPack: FilmPack;
}

const STORAGE_KEY = "film-pack-studio:saved-packs";

function getColorGradeLock(preset: ColorGradePreset, style: FilmTone): string {
  switch (preset) {
    case "neutral-cool restraint":
      return "restrained neutral-cool grade, soft cyan-gray shadows, muted practical warmth, no orange-teal swing";
    case "muted realism":
      return "muted neutral grade, softened saturation, gentle contrast, realistic blacks, no strong warm-cool split";
    case "soft warm intimacy":
      return "soft warm intimacy grade, gentle amber practicals, natural skin tones, warm-neutral shadows, no cold cyan cast";
    case "warm-neutral documentary":
    default:
      if (style === "psychological drama") {
        return "grounded warm-neutral base with restrained cool shadows, consistent practical warmth, no abrupt temperature swing";
      }
      return "grounded warm-neutral documentary grade, controlled cool dusk only in backgrounds, consistent practical warmth, no harsh cyan shift";
  }
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function resizeImageFile(file: File, maxWidth = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Failed to load image for resize."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function FilmPackStudio() {
  const [title, setTitle] = useState("Community in Motion");
  const [originalScript, setOriginalScript] = useState(SAMPLE_SCRIPT);
  const [lockedVoiceOver, setLockedVoiceOver] = useState("");
  const [narratorCharacter, setNarratorCharacter] = useState("");
  const [onScreenCharacter, setOnScreenCharacter] = useState("");
  const [referenceTag, setReferenceTag] = useState(DEFAULT_REFERENCE_TAG);
  const [sceneCount, setSceneCount] = useState<SceneCountInput>("auto");
  const [style, setStyle] = useState<FilmTone>("cinematic documentary");
  const [colorGradePreset, setColorGradePreset] = useState<ColorGradePreset>("warm-neutral documentary");
  const [strictMode, setStrictMode] = useState(true);
  const [masterReferenceImages, setMasterReferenceImages] = useState<string[]>([]);
  const [masterReferenceUrls, setMasterReferenceUrls] = useState("");
  const [officialMasterReference, setOfficialMasterReference] = useState<string | null>(null);
  const [beatSheet, setBeatSheet] = useState<BeatItem[]>([]);
  const [beatSceneCount, setBeatSceneCount] = useState<number | null>(null);
  const [beatLoading, setBeatLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FilmPack | null>(null);
  const [sceneImages, setSceneImages] = useState<Record<number, string>>({});
  const [companionImages, setCompanionImages] = useState<Record<string, string>>({});
  const [sceneImageMeta, setSceneImageMeta] = useState<Record<number, string>>({});
  const [companionImageMeta, setCompanionImageMeta] = useState<Record<string, string>>({});
  const [sceneImageLoading, setSceneImageLoading] = useState<Record<number, boolean>>({});
  const [companionImageLoading, setCompanionImageLoading] = useState<Record<string, boolean>>({});
  const [sceneImageErrors, setSceneImageErrors] = useState<Record<number, string>>({});
  const [companionImageErrors, setCompanionImageErrors] = useState<Record<string, string>>({});
  const [companionLoading, setCompanionLoading] = useState<Record<number, "broll" | "transition" | null>>({});
  const [savedPacks, setSavedPacks] = useState<SavedFilmPackRecord[]>([]);

  const fullCopy = useMemo(() => (result ? fullOutputCopy(result) : ""), [result]);
  const referenceSceneCount = useMemo(
    () => (result ? result.scenes.filter((scene) => scene.useReferenceImage).length : 0),
    [result]
  );
  const projectColorGradeLock = useMemo(() => {
    const leadSceneLighting = result?.scenes?.[0]?.lightingColor?.trim();
    if (leadSceneLighting) {
      return `${getColorGradeLock(colorGradePreset, style)}; anchor to lead scene lighting: ${leadSceneLighting}`;
    }
    return getColorGradeLock(colorGradePreset, style);
  }, [colorGradePreset, result, style]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedFilmPackRecord[];
      if (Array.isArray(parsed)) {
        setSavedPacks(parsed);
      }
    } catch {
      setSavedPacks([]);
    }
  }, []);

  const persistSavedPacks = (records: SavedFilmPackRecord[]) => {
    setSavedPacks(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  };

  const saveCurrentPack = () => {
    if (!result) return;
    const record: SavedFilmPackRecord = {
      id: crypto.randomUUID(),
      title: result.title,
      style: result.style,
      sceneCount: result.scenes.length,
      createdAt: new Date().toISOString(),
      filmPack: result,
    };
    persistSavedPacks([record, ...savedPacks].slice(0, 50));
  };

  const openSavedPack = (id: string) => {
    const target = savedPacks.find((record) => record.id === id);
    if (target) {
      setResult(target.filmPack);
      if (target.filmPack.colorGradePreset) {
        setColorGradePreset(target.filmPack.colorGradePreset);
      }
      setBeatSheet(target.filmPack.beatSheet || []);
      setBeatSceneCount(target.filmPack.beatSheet?.length || target.filmPack.scenes.length);
      setSceneImages({});
      setCompanionImages({});
      setSceneImageLoading({});
      setCompanionImageLoading({});
      setSceneImageErrors({});
      setCompanionImageErrors({});
      setCompanionLoading({});
    }
  };

  const deleteSavedPack = (id: string) => {
    persistSavedPacks(savedPacks.filter((record) => record.id !== id));
  };

  const onUploadMasterRefs = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    const dataUrls = await Promise.all(files.map((file) => resizeImageFile(file)));
    setMasterReferenceImages(dataUrls.filter(Boolean));
  };

  const parsedMasterUrls = useMemo(
    () =>
      masterReferenceUrls
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^https?:\/\//i.test(line)),
    [masterReferenceUrls]
  );

  const referenceCandidates = useMemo(
    () => [...masterReferenceImages, ...parsedMasterUrls],
    [masterReferenceImages, parsedMasterUrls]
  );

  const effectiveMasterReferences = useMemo(() => {
    if (officialMasterReference) {
      return [officialMasterReference];
    }
    return referenceCandidates;
  }, [officialMasterReference, referenceCandidates]);

  useEffect(() => {
    if (!referenceCandidates.length) {
      setOfficialMasterReference(null);
      return;
    }

    if (!officialMasterReference || !referenceCandidates.includes(officialMasterReference)) {
      setOfficialMasterReference(referenceCandidates[0]);
    }
  }, [officialMasterReference, referenceCandidates]);

  const generateBeatSheet = async (): Promise<GenerateBeatSheetResponse> => {
    setBeatLoading(true);
    try {
      const response = await fetch("/api/generate-beats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            title,
            originalScript,
            lockedVoiceOver,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            sceneCount,
            style,
            colorGradePreset,
            strictMode,
          },
        }),
      });

      const raw = await response.text();
      let payload: (GenerateBeatSheetResponse & { error?: string }) | null = null;
      try {
        payload = JSON.parse(raw) as GenerateBeatSheetResponse & { error?: string };
      } catch {
        payload = {
          error: raw.includes("FUNCTION_INVOCATION_TIMEOUT")
            ? "Vercel function timeout while generating beat sheet."
            : raw || "Beat sheet generation failed (non-JSON response).",
        } as GenerateBeatSheetResponse & { error?: string };
      }

      if (!response.ok || !payload?.beatSheet) {
        throw new Error(payload?.error || "Beat sheet generation failed.");
      }

      setBeatSheet(payload.beatSheet);
      setBeatSceneCount(payload.sceneCount);
      return { beatSheet: payload.beatSheet, sceneCount: payload.sceneCount };
    } finally {
      setBeatLoading(false);
    }
  };

  const generateSceneImage = async (scene: SceneItem | CompanionShot) => {
    if (!result) return;
    const isCompanion = "id" in scene;
    const loadingKey = isCompanion ? scene.id : scene.sceneNumber;

    if (isCompanion) {
      setCompanionImageLoading((prev) => ({ ...prev, [loadingKey]: true }));
      setCompanionImageErrors((prev) => ({ ...prev, [loadingKey]: "" }));
      setCompanionImageMeta((prev) => ({ ...prev, [loadingKey]: "" }));
    } else {
      setSceneImageLoading((prev) => ({ ...prev, [loadingKey]: true }));
      setSceneImageErrors((prev) => ({ ...prev, [loadingKey]: "" }));
      setSceneImageMeta((prev) => ({ ...prev, [loadingKey]: "" }));
    }

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: scene.imagePrompt,
          sceneNumber: isCompanion ? scene.parentSceneNumber : scene.sceneNumber,
          useReferenceImage: scene.useReferenceImage,
          referenceTag,
          style,
          colorGradePreset,
          lightingColor: scene.lightingColor,
          projectColorGradeLock,
          strictMode,
          continuitySeed: `${result.title}|${referenceTag || "NO_REF"}`,
          masterReferenceImages: effectiveMasterReferences,
        }),
      });

      const raw = await response.text();
      let payload: GenerateImageResponse = {};
      try {
        payload = JSON.parse(raw) as GenerateImageResponse;
      } catch {
        payload = {
          error: raw.includes("Request Entity Too Large")
            ? "Request too large. Use fewer/smaller master reference images."
            : raw || "Image generation failed (non-JSON response).",
        };
      }

      if (!response.ok) {
        throw new Error(payload.error || "Image generation failed.");
      }

      if (payload.taskId) {
        let resolvedImage: string | null = null;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await sleep(2000);

          const statusResponse = await fetch(`/api/generate-image?taskId=${encodeURIComponent(payload.taskId)}`, {
            method: "GET",
          });
          const statusPayload = (await statusResponse.json().catch(() => null)) as GenerateImageResponse | null;

          if (!statusResponse.ok) {
            throw new Error(statusPayload?.error || "Image generation status check failed.");
          }

          if (statusPayload?.imageDataUrl) {
            resolvedImage = statusPayload.imageDataUrl;
            break;
          }

          if (statusPayload?.status === "failed") {
            throw new Error(statusPayload.error || "Image generation failed.");
          }
        }

        if (!resolvedImage) {
          throw new Error("Image generation is taking too long. Please retry.");
        }

        payload.imageDataUrl = resolvedImage;
      }

      if (!payload.imageDataUrl) {
        throw new Error(payload.error || "Image generation failed.");
      }

      const providerLabel = payload.provider
        ? payload.fallbackFrom
          ? `${payload.provider} (fallback from ${payload.fallbackFrom})`
          : payload.provider
        : "";
      const metaLabel = [providerLabel, payload.modelUsed].filter(Boolean).join(" · ");

      if (isCompanion) {
        setCompanionImages((prev) => ({ ...prev, [loadingKey]: payload.imageDataUrl as string }));
        setCompanionImageMeta((prev) => ({ ...prev, [loadingKey]: metaLabel }));
      } else {
        setSceneImages((prev) => ({ ...prev, [loadingKey]: payload.imageDataUrl as string }));
        setSceneImageMeta((prev) => ({ ...prev, [loadingKey]: metaLabel }));
      }
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Image generation failed.";
      if (isCompanion) {
        setCompanionImageErrors((prev) => ({ ...prev, [loadingKey]: message }));
      } else {
        setSceneImageErrors((prev) => ({ ...prev, [loadingKey]: message }));
      }
    } finally {
      if (isCompanion) {
        setCompanionImageLoading((prev) => ({ ...prev, [loadingKey]: false }));
      } else {
        setSceneImageLoading((prev) => ({ ...prev, [loadingKey]: false }));
      }
    }
  };

  const generateCompanionShot = async (scene: SceneItem, kind: "broll" | "transition") => {
    if (!result) return;

    setCompanionLoading((prev) => ({ ...prev, [scene.sceneNumber]: kind }));
    setCompanionImageErrors((prev) => ({
      ...prev,
      [`scene-${scene.sceneNumber}-broll`]: "",
      [`scene-${scene.sceneNumber}-transition`]: "",
    }));
    try {
      const response = await fetch("/api/generate-companion-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: result.title,
          style: result.style,
          colorGradePreset,
          settingNote: result.settingNote,
          characterReferenceGuidance: result.characterReferenceGuidance,
          referenceTag,
          projectColorGradeLock,
          strictMode,
          scene,
        }),
      });

      const raw = await response.text();
      let payload: GenerateCompanionShotPayload | null = null;
      try {
        payload = JSON.parse(raw) as GenerateCompanionShotPayload;
      } catch {
        payload = { error: raw || "Failed to generate companion shot." };
      }

      if (!response.ok || !payload.shot) {
        throw new Error(payload.error || "Failed to generate companion shot.");
      }

      const createdShot = payload.shot;
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((item) =>
            item.sceneNumber === scene.sceneNumber
              ? {
                  ...item,
                  companionShots: [...(item.companionShots || []), createdShot],
                }
              : item
          ),
        };
      });

      await generateSceneImage(createdShot);
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : "Failed to generate companion shot.";
      setCompanionImageErrors((prev) => ({ ...prev, [`scene-${scene.sceneNumber}-${kind}`]: message }));
    } finally {
      setCompanionLoading((prev) => ({ ...prev, [scene.sceneNumber]: null }));
    }
  };

  const onGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const beatResponse = await generateBeatSheet();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            title,
            originalScript,
            lockedVoiceOver,
            narratorCharacter,
            onScreenCharacter,
            referenceTag,
            sceneCount,
            style,
            colorGradePreset,
            strictMode,
          },
          beatSheet: beatResponse.beatSheet,
        }),
      });

      const raw = await response.text();
      let payload: (GenerateResponse & { error?: string }) | null = null;
      try {
        payload = JSON.parse(raw) as GenerateResponse & { error?: string };
      } catch {
        payload = {
          error: raw.includes("FUNCTION_INVOCATION_TIMEOUT")
            ? "Vercel function timeout while generating film pack."
            : raw || "Generation failed (non-JSON response).",
        } as GenerateResponse & { error?: string };
      }

      if (!response.ok || !payload?.filmPack) {
        throw new Error(payload?.error || "Generation failed.");
      }

      setResult(payload.filmPack);
      setBeatSheet(payload.filmPack.beatSheet || beatResponse.beatSheet);
      setBeatSceneCount(payload.filmPack.beatSheet?.length || beatResponse.sceneCount);
      setSceneImages({});
      setCompanionImages({});
      setSceneImageLoading({});
      setCompanionImageLoading({});
      setSceneImageErrors({});
      setCompanionImageErrors({});
      setCompanionLoading({});
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Generation failed.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
      <section className="mb-8 rounded-3xl border border-white/15 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Film Pre-Production Toolkit</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Film Pack Studio</h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-300 sm:text-base">
          Turn an original script into a production-ready film pack: preserved VO, scene structure, Kling O1 prompts,
          and image-to-video prompt flow tuned for fast short-video execution with a small B-roll layer for pacing.
        </p>
      </section>

      <form onSubmit={onGenerate} className="space-y-5 rounded-2xl border border-white/10 bg-zinc-900/80 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Optional Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. The Corridor Promise"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Narrator / POV Character</span>
            <input
              value={narratorCharacter}
              onChange={(event) => setNarratorCharacter(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. Bryan"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Primary On-Screen Character</span>
            <input
              value={onScreenCharacter}
              onChange={(event) => setOnScreenCharacter(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="e.g. Samuel"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Optional Character Reference Tag</span>
            <input
              value={referenceTag}
              onChange={(event) => setReferenceTag(event.target.value)}
              onBlur={(event) => setReferenceTag(normalizeReferenceTag(event.target.value))}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="Leave blank if this story has no main character reference"
            />
          </label>
        </div>

        <p className="text-xs text-zinc-400">
          Use these two fields when one person narrates about another. Example: narrator = Bryan, on-screen character =
          Samuel.
        </p>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Original Script / Story</span>
          <textarea
            value={originalScript}
            onChange={(event) => setOriginalScript(event.target.value)}
            className="min-h-52 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            placeholder="Paste full script here"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Locked VO Script (Optional, no rewrite)</span>
          <textarea
            value={lockedVoiceOver}
            onChange={(event) => setLockedVoiceOver(event.target.value)}
            className="min-h-36 rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            placeholder="Paste your final VO here. If provided, system will keep this VO exactly."
          />
        </label>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-zinc-100">Character Master Reference (for consistency)</p>
          <p className="text-xs text-zinc-400">
            Optional. Leave this empty for stories with no main character reference. If used, choose one official master ref and scene image generation will bind to it by default.
          </p>
          <label className="grid gap-2">
            <span className="text-xs text-zinc-300">Upload 1-4 master images (best for Gemini)</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onUploadMasterRefs}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-200"
            />
          </label>
          {referenceCandidates.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {referenceCandidates.map((src, index) => {
                const isOfficial = officialMasterReference === src;
                return (
                <div
                  key={`${src.slice(0, 40)}-${index}`}
                  className={`overflow-hidden rounded-lg border ${isOfficial ? "border-cyan-300/70" : "border-white/10"}`}
                >
                  {/* Remote master refs can come from arbitrary providers, so this preview intentionally avoids Next image optimization. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Master ref ${index + 1}`}
                    className="h-20 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setOfficialMasterReference(src)}
                    className={`w-full border-t px-2 py-1 text-[11px] font-medium ${
                      isOfficial
                        ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-200"
                        : "border-white/10 bg-black/30 text-zinc-300"
                    }`}
                  >
                    {isOfficial ? "Official master ref" : "Set as official"}
                  </button>
                </div>
                );
              })}
            </div>
          ) : null}
          <label className="grid gap-2">
            <span className="text-xs text-zinc-300">
              Optional master image URL list (one per line, used by Kling image_list)
            </span>
            <textarea
              value={masterReferenceUrls}
              onChange={(event) => setMasterReferenceUrls(event.target.value)}
              className="min-h-24 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="https://.../master-1.jpg"
            />
          </label>
        </section>

        {beatSheet.length > 0 ? (
          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">Beat Sheet Preview</p>
                <p className="text-xs text-zinc-400">
                  {beatSceneCount || beatSheet.length} beats locked for the next scene pack generation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void generateBeatSheet().catch((beatError) => {
                    setError(beatError instanceof Error ? beatError.message : "Beat sheet generation failed.");
                  });
                }}
                disabled={beatLoading}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15 disabled:opacity-60"
              >
                {beatLoading ? "Refreshing..." : "Refresh Beat Sheet"}
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {beatSheet.map((beat) => (
                <div key={beat.beatNumber} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-100">Beat {beat.beatNumber}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.phase}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.role}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{beat.importance}</span>
                  </div>
                  <p className="mb-2 max-h-14 overflow-hidden">{beat.voLine}</p>
                  <p className="text-zinc-400">{beat.purpose}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Scene Count</span>
            <select
              value={sceneCount}
              onChange={(event) => {
                const value = event.target.value;
                setSceneCount(value === "auto" ? "auto" : (Number(value) as SceneCountInput));
              }}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              {SCENE_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count === "auto" ? "Auto (recommended)" : `${count} scenes`}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-200">Tone / Style</span>
            <select
              value={style}
              onChange={(event) => setStyle(event.target.value as FilmTone)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
            >
              {FILM_STYLES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Color Grade Preset</span>
          <select
            value={colorGradePreset}
            onChange={(event) => setColorGradePreset(event.target.value as ColorGradePreset)}
            className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
          >
            {COLOR_GRADE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="space-y-1">
            <span className="text-sm font-medium text-zinc-100">Strict Mode (API)</span>
            <p className="text-xs text-zinc-400">
              ON = stability-first, concise and consistent. OFF = more creative variation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStrictMode((value) => !value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              strictMode
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-200"
                : "border-white/20 bg-black/40 text-zinc-300"
            }`}
          >
            {strictMode ? "ON" : "OFF"}
          </button>
        </label>

        <RulesPanel />

        <button
          type="submit"
          disabled={loading || beatLoading}
          className="inline-flex items-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Generating film pack..." : beatLoading ? "Generating beat sheet..." : "Generate Film Pack"}
        </button>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </form>

      {result ? (
        <section className="mt-8 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-100">{result.title}</h2>
                <p className="text-sm text-zinc-300">{result.style}</p>
                <p className="text-xs text-zinc-400">{colorGradePreset}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                {result.scenes.length} scenes
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                {referenceSceneCount} reference-tag scenes
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                strict mode: {strictMode ? "on" : "off"}
              </span>
              {result.beatSheet?.length ? (
                <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                  beat-first flow: on
                </span>
              ) : null}
            </div>

            <div className="sticky top-3 z-10 mb-4 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/85 p-3 backdrop-blur">
                <CopyButton text={fullCopy} label="Copy full output" />
                <button
                  type="button"
                  onClick={saveCurrentPack}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Save Archive
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(toFilmPackText(result), "film-pack.txt", "text/plain")}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Download TXT
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(toFilmPackMarkdown(result), "film-pack.md", "text/markdown")}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                >
                  Download Markdown
                </button>
            </div>

            <div className="space-y-3 text-sm text-zinc-300">
              <p>
                <span className="font-semibold text-zinc-100">Singapore setting note:</span> {result.settingNote}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Preserved VO:</span> {result.preservedVoiceOverScript}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Character Reference Guidance:</span>{" "}
                {result.characterReferenceGuidance}
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Color Grade Lock:</span> {projectColorGradeLock}
              </p>
              {officialMasterReference ? (
                <p>
                  <span className="font-semibold text-zinc-100">Official Master Ref:</span>{" "}
                  {officialMasterReference.startsWith("data:") ? "uploaded master image" : officialMasterReference}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {result.scenes.map((scene) => (
              <SceneCard
                key={`${scene.sceneNumber}-${scene.voLine.slice(0, 20)}`}
                scene={scene}
                generatedImageUrl={sceneImages[scene.sceneNumber]}
                generatingImage={sceneImageLoading[scene.sceneNumber]}
                imageError={sceneImageErrors[scene.sceneNumber]}
                imageMeta={sceneImageMeta[scene.sceneNumber]}
                companionImageUrls={companionImages}
                companionImageMeta={companionImageMeta}
                companionImageLoading={companionImageLoading}
                companionImageErrors={companionImageErrors}
                generatingCompanionKind={companionLoading[scene.sceneNumber] || null}
                companionActionError={
                  companionImageErrors[`scene-${scene.sceneNumber}-broll`] ||
                  companionImageErrors[`scene-${scene.sceneNumber}-transition`]
                }
                onGenerateImage={generateSceneImage}
                onGenerateCompanion={generateCompanionShot}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
        <h3 className="mb-3 text-lg font-semibold text-zinc-100">Saved Archives</h3>
        {savedPacks.length === 0 ? (
          <p className="text-sm text-zinc-400">No saved film packs yet.</p>
        ) : (
          <div className="space-y-2">
            {savedPacks.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="text-sm text-zinc-300">
                  <p className="font-medium text-zinc-100">{record.title}</p>
                  <p className="text-xs text-zinc-400">
                    {record.style} · {record.sceneCount} scenes ·{" "}
                    {new Date(record.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openSavedPack(record.id)}
                    className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedPack(record.id)}
                    className="rounded-md border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
