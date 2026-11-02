# Build the video guides

Run from the repository root. Requires Node 24, npm, FFmpeg/FFprobe and Google Chrome at the standard macOS application path. `render.mjs` and `capture.mjs` contain the browser path; adjust it on another operating system. Application development setup remains in [the client guide](../../docs/operations/SETUP.md).

```sh
npm ci
npm --prefix media/tutorials ci
npm --prefix media/tutorials run typecheck
npm --prefix media/tutorials audit
```

The root `.env.elevenlabs.local` must contain `ELEVENLABS_API_KEY`, with permissions `0600`. It is ignored by Git. Narration uses the existing Matilda voice and `eleven_multilingual_v2`; no cloned voice is required. New speech or Scribe requests consume the account's credits. Unchanged narration reuses its audio/alignment cache. The script never logs the key or provider error bodies.

If the original recordings and audio have been retained, skip fixture setup and live capture. For a fresh recording, protected root `.env.vercel.local` and `.env.owner.local` must already be configured for the exact client in `deployment.json`. These commands create thirteen temporary accounts plus an isolated demonstration class, make actual tutorial actions and remove them afterward. Never run unrelated E2E jobs against the same fixture state concurrently.

```sh
npm --prefix media/tutorials run setup:demo
npm --prefix media/tutorials run capture
npm --prefix media/tutorials run verify:roles
npm --prefix media/tutorials run cleanup
```

Run capture before cleanup. Capture can resume completed scenes; `SCENE=teacher-ai,student-help` limits it to selected scene IDs. Delete only those selected entries from the ignored `captures.json` to deliberately replace recordings. Preserve the private fixture ledger until cleanup succeeds. A fresh recording also requires regenerating role-verification evidence before final verification; see the role proof script in `scripts/`.

```sh
npm --prefix media/tutorials run narrate
npm --prefix media/tutorials run prepare:assets
npm --prefix media/tutorials run studio
npm --prefix media/tutorials run render
npm --prefix media/tutorials run finalize
npm --prefix media/tutorials run gallery
npm --prefix media/tutorials run verify
npm --prefix media/tutorials run verify:audio
npm --prefix media/tutorials run package
```

`prepare` refuses missing live footage. Studio is optional and uses local public assets only. Stop Studio before a large render if the machine is low on memory. The renderer resumes valid scene/chapter files by frame count. **After changing a scene, footage or layout, use `npm --prefix media/tutorials run render -- --force`** to invalidate cached video. `EPISODE=Teacher` or `EPISODE=Student` limits rendering to that composition; run finalization after all required chapters are ready. The first render can take several minutes per chapter.

Independent speech QC is available through `npm --prefix media/tutorials run qc:speech`; it submits the narration to ElevenLabs Scribe v2 and caches the transcript. Delete that transcript only when intentionally requesting a new paid transcription. Optional local Whisper QC is in `scripts/transcribe-qc.py`; small-model hallucinations must be confirmed against the speech before treating them as defects.

Final verification decodes every export, checks streams/frame counts/captions, confirms all fourteen authenticated roles and requires completed fixture cleanup. Automated evidence does not replace uninterrupted human viewing/listening acceptance. [QA record](../../docs/qa/VIDEO_GUIDES.md).

To view finished media without serving credentials or private artifacts:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory artifacts/tutorials/exports
```

With that server running, `npm --prefix media/tutorials run verify:gallery` checks playback, caption loading, mobile/desktop layout, accessibility and archive links.

Open `http://127.0.0.1:8766`. The gallery offers role chapters, MP4 downloads and separate captions. Copy the entire exports folder for a portable handoff. Nothing here changes Vercel deployment or application configuration.
