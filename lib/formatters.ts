import type { FilmPack } from "@/types/film-pack";

export function toFilmPackMarkdown(pack: FilmPack): string {
  const header = `# ${pack.title}\n\n- Style: ${pack.style}\n- Setting: ${pack.settingNote}\n\n## Preserved Voice Over\n${pack.preservedVoiceOverScript}\n\n## Character Reference Guidance\n${pack.characterReferenceGuidance}\n\n## Scenes\n`;

  const sceneBlocks = pack.scenes
    .map((scene) => {
      return `### Scene ${scene.sceneNumber}\n- VO line: ${scene.voLine}\n- Shot type: ${scene.shotType}\n- Scene purpose: ${scene.scenePurpose}\n- Importance: ${scene.importance}\n- Reference image: ${scene.useReferenceImage ? "yes" : "no"}\n- Image prompt: ${scene.imagePrompt}\n- Video prompt: ${scene.videoPrompt}\n- Camera: ${scene.camera}\n- Lighting / Color: ${scene.lightingColor}`;
    })
    .join("\n\n");

  return `${header}\n${sceneBlocks}\n`;
}

export function toFilmPackText(pack: FilmPack): string {
  return toFilmPackMarkdown(pack)
    .replace(/^#\s/gm, "")
    .replace(/^##\s/gm, "")
    .replace(/^###\s/gm, "")
    .replace(/-\s/gm, "• ");
}

export function fullOutputCopy(pack: FilmPack): string {
  return toFilmPackMarkdown(pack);
}
