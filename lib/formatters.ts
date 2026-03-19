import type { FilmPack } from "@/types/film-pack";

export function toFilmPackMarkdown(pack: FilmPack): string {
  const beatSheetBlock = pack.beatSheet?.length
    ? `## Beat Sheet\n${pack.beatSheet
        .map(
          (beat) =>
            `- Beat ${beat.beatNumber}: [${beat.phase}] storyArc=${beat.storyArc}, shotGrammarPreset=${beat.shotGrammarPreset}, role=${beat.role}, importance=${beat.importance}, visualRole=${beat.visualRole}, framingIntent=${beat.framingIntent}, VO=${beat.voLine}, purpose=${beat.purpose}`
        )
        .join("\n")}\n\n`
    : "";

  const header = `# ${pack.title}\n\n- Style: ${pack.style}\n- Frame ratio: ${pack.aspectRatio || "16:9"}\n- Setting: ${pack.settingNote}\n\n## Preserved Voice Over\n${pack.preservedVoiceOverScript}\n\n## Character Reference Guidance\n${pack.characterReferenceGuidance}\n\n${beatSheetBlock}## Scenes\n`;

  const sceneBlocks = pack.scenes
    .map((scene) => {
      const companionBlock = scene.companionShots?.length
        ? `\n- Companion shots:\n${scene.companionShots
            .map(
              (shot) =>
                `  - ${shot.label}: kind=${shot.kind}, shot type=${shot.shotType}, camera style=${shot.cameraStyle || "(not specified)"}, action style=${shot.actionStyle || "(not specified)"}, purpose=${shot.scenePurpose}, image prompt=${shot.imagePrompt}, video prompt=${shot.videoPrompt}`
            )
            .join("\n")}`
        : "";

      const dialogueBlock =
        scene.sceneType === "dialogue"
          ? `\n- Voice script: ${scene.voiceScript || "(not provided)"}\n- Lip sync prompt: ${scene.lipSyncPrompt || "(not provided)"}\n- Micro acting: ${scene.microActingPrompt || "(not provided)"}\n- Reaction shot: ${scene.reactionShotPrompt || "(not provided)"}\n- Pair coverage bias: ${scene.pairCoverageBias || "(not provided)"}`
          : "";
      const actionBlock =
        scene.sceneType === "action"
          ? `\n- Action sequence: ${scene.actionSequence || "(not provided)"}\n- Impact beat: ${scene.impactBeat || "(not provided)"}\n- Enemy response: ${scene.enemyResponse || "(not provided)"}\n- Aftermath shot: ${scene.aftermathShot || "(not provided)"}`
          : "";
      const environmentBlock =
        scene.sceneType === "environment"
          ? `\n- Establishing beat: ${scene.establishingBeat || "(not provided)"}\n- Cutaway prompt: ${scene.cutawayPrompt || "(not provided)"}\n- Atmosphere note: ${scene.atmosphereNote || "(not provided)"}\n- Transition beat: ${scene.transitionBeat || "(not provided)"}`
          : "";
      const emotionalBlock =
        scene.sceneType === "emotional"
          ? `\n- Micro tension: ${scene.microTensionPrompt || "(not provided)"}\n- Silence beat: ${scene.silenceBeat || "(not provided)"}\n- Eye-line shift: ${scene.eyeLineShiftPrompt || "(not provided)"}\n- Pull-away shot: ${scene.pullAwayShot || "(not provided)"}`
          : "";

      return `### Scene ${scene.sceneNumber}\n- Phase: ${scene.phase}\n- VO line: ${scene.voLine}\n- Scene type: ${scene.sceneType || "(not specified)"}\n- Shot type: ${scene.shotType}\n- Shot grammar: ${scene.shotGrammarPreset || "(not specified)"}\n- Camera style: ${scene.cameraStyle || "(not specified)"}\n- Action style: ${scene.actionStyle || "(not specified)"}\n- Scene purpose: ${scene.scenePurpose}\n- Importance: ${scene.importance}\n- Reference image: ${scene.useReferenceImage ? "yes" : "no"}\n- Image prompt: ${scene.imagePrompt}\n- Video prompt: ${scene.videoPrompt}\n- Camera: ${scene.camera}\n- Lighting / Color: ${scene.lightingColor}${dialogueBlock}${actionBlock}${environmentBlock}${emotionalBlock}${companionBlock}`;
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
