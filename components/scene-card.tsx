import type { SceneItem } from "@/types/film-pack";
import { CopyButton } from "@/components/copy-button";

interface SceneCardProps {
  scene: SceneItem;
}

export function SceneCard({ scene }: SceneCardProps) {
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
          <span className="font-semibold text-zinc-100">Shot type:</span> {scene.shotType}
        </p>
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
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Image Prompt</p>
            <CopyButton text={scene.imagePrompt} label="Copy image" />
          </div>
          <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{scene.imagePrompt}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Video Prompt</p>
            <CopyButton text={scene.videoPrompt} label="Copy video" />
          </div>
          <p className="text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{scene.videoPrompt}</p>
        </div>
      </div>
    </article>
  );
}
