import Image from "next/image";
import type { CompanionShot, SceneItem } from "@/types/film-pack";
import { CopyButton } from "@/components/copy-button";

interface SceneCardProps {
  scene: SceneItem;
  generatedImageUrl?: string;
  generatingImage?: boolean;
  imageError?: string;
  imageMeta?: string;
  companionImageUrls?: Record<string, string>;
  companionImageMeta?: Record<string, string>;
  companionImageLoading?: Record<string, boolean>;
  companionImageErrors?: Record<string, string>;
  generatingCompanionKind?: "broll" | "transition" | null;
  companionActionError?: string;
  onGenerateImage?: (scene: SceneItem | CompanionShot) => void;
  onGenerateCompanion?: (scene: SceneItem, kind: "broll" | "transition") => void;
}

export function SceneCard({
  scene,
  generatedImageUrl,
  generatingImage,
  imageError,
  imageMeta,
  companionImageUrls,
  companionImageMeta,
  companionImageLoading,
  companionImageErrors,
  generatingCompanionKind,
  companionActionError,
  onGenerateImage,
  onGenerateCompanion,
}: SceneCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-lg font-semibold text-zinc-100">Scene {scene.sceneNumber}</h4>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
            {scene.phase}
          </span>
          <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
            {scene.importance}
          </span>
        </div>
      </div>

      <p className="mb-3 text-sm text-zinc-200">
        <span className="font-semibold text-zinc-100">VO:</span> {scene.voLine}
      </p>

      <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-zinc-100">Scene type:</span> {scene.sceneType || "emotional"}
        </p>
        <p>
          <span className="font-semibold text-zinc-100">Shot type:</span> {scene.shotType}
        </p>
        {scene.shotGrammarPreset ? (
          <p>
            <span className="font-semibold text-zinc-100">Shot grammar:</span> {scene.shotGrammarPreset}
          </p>
        ) : null}
        {scene.cameraStyle ? (
          <p>
            <span className="font-semibold text-zinc-100">Camera style:</span> {scene.cameraStyle}
          </p>
        ) : null}
        {scene.actionStyle ? (
          <p>
            <span className="font-semibold text-zinc-100">Action style:</span> {scene.actionStyle}
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-zinc-100">Purpose:</span> {scene.scenePurpose}
        </p>
        <p>
          <span className="font-semibold text-zinc-100">Reference image:</span>{" "}
          {scene.useReferenceImage ? "yes" : "no"}
        </p>
        <p>
          <span className="font-semibold text-zinc-100">Camera:</span> {scene.camera}
        </p>
        <p className="sm:col-span-2">
          <span className="font-semibold text-zinc-100">Lighting / Color:</span> {scene.lightingColor}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onGenerateCompanion?.(scene, "broll")}
            disabled={generatingCompanionKind !== null || !onGenerateCompanion}
            className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-60"
          >
            {generatingCompanionKind === "broll" ? "Generating B-roll..." : "Generate B-roll"}
          </button>
          <button
            type="button"
            onClick={() => onGenerateCompanion?.(scene, "transition")}
            disabled={generatingCompanionKind !== null || !onGenerateCompanion}
            className="rounded-md border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
          >
            {generatingCompanionKind === "transition" ? "Generating Transition..." : "Generate Transition"}
          </button>
        </div>
        {companionActionError ? <p className="text-xs text-rose-300">{companionActionError}</p> : null}

        {scene.companionShots?.length ? (
          <div className="space-y-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Companion Shots</p>
            {scene.companionShots.map((shot) => (
              <div key={shot.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{shot.label}</span>
                    <span className="rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-300">
                      {shot.kind}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGenerateImage?.(shot)}
                    disabled={companionImageLoading?.[shot.id] || !onGenerateImage}
                    className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    {companionImageLoading?.[shot.id]
                      ? "Generating..."
                      : companionImageUrls?.[shot.id]
                        ? "Regenerate image"
                        : "Generate image"}
                  </button>
                </div>
                <p className="mb-2 text-sm text-zinc-300">
                  <span className="font-semibold text-zinc-100">VO:</span> {shot.voLine}
                </p>
                <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                  <p>
                    <span className="font-semibold text-zinc-100">Shot type:</span> {shot.shotType}
                  </p>
                  {shot.shotGrammarPreset ? (
                    <p>
                      <span className="font-semibold text-zinc-100">Shot grammar:</span> {shot.shotGrammarPreset}
                    </p>
                  ) : null}
                  {shot.cameraStyle ? (
                    <p>
                      <span className="font-semibold text-zinc-100">Camera style:</span> {shot.cameraStyle}
                    </p>
                  ) : null}
                  {shot.actionStyle ? (
                    <p>
                      <span className="font-semibold text-zinc-100">Action style:</span> {shot.actionStyle}
                    </p>
                  ) : null}
                  <p>
                    <span className="font-semibold text-zinc-100">Purpose:</span> {shot.scenePurpose}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-100">Camera:</span> {shot.camera}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-100">Lighting / Color:</span> {shot.lightingColor}
                  </p>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Image Prompt</p>
                      <CopyButton text={shot.imagePrompt} label="Copy image" />
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{shot.imagePrompt}</p>
                    {companionImageMeta?.[shot.id] ? (
                      <p className="mt-2 text-[11px] uppercase tracking-wide text-cyan-200/80">
                        Provider: {companionImageMeta[shot.id]}
                      </p>
                    ) : null}
                    {companionImageErrors?.[shot.id] ? (
                      <p className="mt-2 text-xs text-rose-300">{companionImageErrors[shot.id]}</p>
                    ) : null}
                    {companionImageUrls?.[shot.id] ? (
                      <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                        <Image
                          src={companionImageUrls[shot.id]}
                          alt={`${shot.label} generated visual`}
                          width={1280}
                          height={720}
                          unoptimized
                          className="h-auto w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Video Prompt</p>
                      <CopyButton text={shot.videoPrompt} label="Copy video" />
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{shot.videoPrompt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Image Prompt</p>
            <div className="flex gap-2">
              <CopyButton text={scene.imagePrompt} label="Copy image" />
              <button
                type="button"
                onClick={() => onGenerateImage?.(scene)}
                disabled={generatingImage || !onGenerateImage}
                className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
              >
                {generatingImage ? "Generating..." : generatedImageUrl ? "Regenerate" : "Generate image"}
              </button>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{scene.imagePrompt}</p>
          {imageMeta ? (
            <p className="mt-2 text-[11px] uppercase tracking-wide text-cyan-200/80">Provider: {imageMeta}</p>
          ) : null}
          {imageError ? <p className="mt-2 text-xs text-rose-300">{imageError}</p> : null}
          {generatedImageUrl ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
              <Image
                src={generatedImageUrl}
                alt={`Scene ${scene.sceneNumber} generated visual`}
                width={1280}
                height={720}
                unoptimized
                className="h-auto w-full object-cover"
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Video Prompt</p>
            <CopyButton text={scene.videoPrompt} label="Copy video" />
          </div>
          <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{scene.videoPrompt}</p>
        </div>

        {scene.sceneType === "dialogue" ? (
          <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.04] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-200">Dialogue Director Pack</p>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Voice Script</p>
                  <CopyButton text={scene.voiceScript || ""} label="Copy voice" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.voiceScript || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Lip Sync Prompt</p>
                  <CopyButton text={scene.lipSyncPrompt || ""} label="Copy lip sync" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.lipSyncPrompt || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Micro Acting</p>
                  <CopyButton text={scene.microActingPrompt || ""} label="Copy acting" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.microActingPrompt || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Reaction Shot</p>
                  <CopyButton text={scene.reactionShotPrompt || ""} label="Copy reaction" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.reactionShotPrompt || "(not provided)"}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {scene.sceneType === "action" ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-200">Action Director Pack</p>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Action Sequence</p>
                  <CopyButton text={scene.actionSequence || ""} label="Copy sequence" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.actionSequence || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Impact Beat</p>
                  <CopyButton text={scene.impactBeat || ""} label="Copy impact" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.impactBeat || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Enemy Response</p>
                  <CopyButton text={scene.enemyResponse || ""} label="Copy response" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.enemyResponse || "(not provided)"}
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Aftermath Shot</p>
                  <CopyButton text={scene.aftermathShot || ""} label="Copy aftermath" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
                  {scene.aftermathShot || "(not provided)"}
                </p>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </article>
  );
}
