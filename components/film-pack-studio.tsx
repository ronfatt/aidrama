"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { RulesPanel } from "@/components/rules-panel";
import { SceneCard } from "@/components/scene-card";
import {
  DEFAULT_REFERENCE_TAG,
  FILM_STYLES,
  SAMPLE_SCRIPT,
  SCENE_COUNTS,
} from "@/lib/constants";
import { fullOutputCopy, toFilmPackMarkdown, toFilmPackText } from "@/lib/formatters";
import type { FilmPack, FilmTone, SceneCountInput } from "@/types/film-pack";

interface GenerateResponse {
  filmPack: FilmPack;
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

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function FilmPackStudio() {
  const [title, setTitle] = useState("Community in Motion");
  const [originalScript, setOriginalScript] = useState(SAMPLE_SCRIPT);
  const [lockedVoiceOver, setLockedVoiceOver] = useState("");
  const [referenceTag, setReferenceTag] = useState(DEFAULT_REFERENCE_TAG);
  const [sceneCount, setSceneCount] = useState<SceneCountInput>("auto");
  const [style, setStyle] = useState<FilmTone>("cinematic documentary");
  const [strictMode, setStrictMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FilmPack | null>(null);
  const [savedPacks, setSavedPacks] = useState<SavedFilmPackRecord[]>([]);

  const fullCopy = useMemo(() => (result ? fullOutputCopy(result) : ""), [result]);
  const referenceSceneCount = useMemo(
    () => (result ? result.scenes.filter((scene) => scene.useReferenceImage).length : 0),
    [result]
  );

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
    }
  };

  const deleteSavedPack = (id: string) => {
    persistSavedPacks(savedPacks.filter((record) => record.id !== id));
  };

  const onGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            title,
            originalScript,
            lockedVoiceOver,
            referenceTag,
            sceneCount,
            style,
            strictMode,
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Generation failed.");
      }

      const payload = (await response.json()) as GenerateResponse;
      setResult(payload.filmPack);
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
          and image-to-video prompt flow tuned for fast short-video execution.
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
            <span className="text-sm font-medium text-zinc-200">Optional Character Reference Tag</span>
            <input
              value={referenceTag}
              onChange={(event) => setReferenceTag(event.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-300/40 focus:ring"
              placeholder="[DARREN_REF]"
            />
          </label>
        </div>

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
          disabled={loading}
          className="inline-flex items-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Generating film pack..." : "Generate Film Pack"}
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
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {result.scenes.map((scene) => (
              <SceneCard key={`${scene.sceneNumber}-${scene.voLine.slice(0, 20)}`} scene={scene} />
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
