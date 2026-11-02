# Video tooling architecture

- `content.json` is the authoritative storyboard, role mapping and narration text. Edit it directly; there is no second script generator.
- `src/index.tsx` registers six 1920×1080, 30 fps Remotion compositions. Scene sequences combine native graphics, real UI footage, step callouts, audio and aligned captions.
- `scripts/` owns credential-safe narration, target-guarded demo fixtures, real browser capture, manifest/caption preparation, resumable rendering, audio normalization, assembly, gallery generation and verification.
- Generated audio/alignment and footage live in `artifacts/tutorials/assets/`. Only this assets directory is copied to the renderer. Provider environments and session state stay outside it.
- Remotion 4.0.539 and React 19 are isolated here; the application lockfile/runtime are unchanged. Zod is overridden to the compatible patched 4.6.6 to resolve GHSA-mrhx-c7xc-m3w5 in Remotion's tooling tree.

The renderer produces video-only scene files, then assembles a continuous 48 kHz narration track with a half-second lead per scene. Padding is calculated from exact 30 fps scene frames after resampling, avoiding per-scene AAC timing drift. Each short render uses a fresh browser. Final chapters normalize speech to a -16 LUFS target and -2 dBTP pre-encode peak target, leaving headroom for AAC; delivery uses H.264/yuv420p and stereo AAC. Finalization converts delivery video to limited-range yuv420p. It concatenates normalized PCM before encoding one master AAC track, preventing encoder-padding drift between chapters, and places subtitles on exact frame-based chapter boundaries.

Demo fixtures use the exact deployment target and isolated UUIDs. Capture signs in with actual trusted roles; owner preview is explicitly labeled. Cleanup removes only fixture records/accounts and their audit references, preserving the protected owner and institutional data. The default web app auth and approval controls are never bypassed for demonstrations.

Source and lockfile are versioned. Generated videos, browser recordings, synthetic-data IDs, QC caches and temporary sessions are ignored. Keep a separate approved backup of finished media and source assets when transferring this project to another machine. See [setup](SETUP.md).
