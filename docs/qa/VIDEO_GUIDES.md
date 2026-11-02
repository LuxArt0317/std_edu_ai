# Video guide production — Issue #77

[Issue #77](https://github.com/LuxArt0317/std_edu_ai/issues/77) tracks the English narrated pitch and six role chapters. [Package guide](../../media/tutorials/README.md) contains coverage; [setup](../../media/tutorials/SETUP.md) documents reproduction.

The 40-scene storyboard totals 12 minutes 43 seconds. Actual production navigation uses thirteen disposable accounts plus the existing owner. Trusted backend metadata verified all fourteen roles before capture. Teacher/student receive the deepest walkthroughs; other roles are grouped around connected academic, service and administrative processes. No institutional research results or measured time savings are invented. Owner preview is labeled as owner access, and drafts are not presented as sent communications.

## Evidence

Ignored local evidence under `artifacts/tutorials/` includes:

- `captures.json`: 32 real UI clips, synthetic-record labels and zero page errors.
- `roles-verified.json`: all fourteen authenticated roles represented by completed recordings.
- `narration.json` and `assets/audio/`: all forty audio clips and character alignment.
- `qc-speech/full-scribe.json` and `comparison.json`: independent full-narration transcription. Word similarity 99.66%; differences are coursework/course work, gradebook/grade book and you're/you are. No missing sentence or substantive wording change was detected.
- `cleanup.json`: completed isolated-record/account/storage cleanup and private session-ledger removal. Independent certificate-verified SQL confirms one protected owner, no test/orphan identities and unchanged 101 migrations/101 public RLS tables.
- `qc/verification.json`: final media/decode/caption/role/privacy checks, generated after rendering.
- `qc/delivery-v2/`: FFmpeg metadata, black/freeze, silence/level and scene-cut diagnostics; contact sheets and boundary review supplement this scan.

Visual inspection covers all source clip endpoints. It caught two Assistant captures ending in a loading indicator; replacement clips show completed responses, with only waiting time shortened. The first long Teacher render hit a browser failure; short independently resumable scene renders replaced that approach. Speech remains continuous within each narrated scene and is padded on exact frame boundaries after resampling. Final verification caught full-range pixel formatting and AAC padding drift from packet-copying chapters. Delivery now explicitly converts to limited-range yuv420p and assembles normalized PCM before a single master AAC encode; every scene is rechecked against its original narration afterward.

The local media dependency audit passes with zero vulnerabilities after a compatible Zod 4.6.6 override. Source type checking passes. No application runtime, schema, role policy, production provider configuration or Vercel deployment changed for this task.

## Final verification

All seven delivered MP4s fully decode: 1920×1080, 30 fps, H.264 limited-range yuv420p and stereo AAC at 48 kHz. The master contains 22,894 video frames, about 12m43s. All 251 caption cues pass timing/bounds checks. Original-to-master waveform checks pass for every narrated scene (minimum correlation 0.97222, maximum offset 0.31 ms), independently confirming the chapter drift correction.

FFmpeg detects zero black intervals. The 330 freeze candidates correspond to purposeful UI/graphic holds with narration/captions; inspected source endpoints and eighty final scene frames support this classification. Longest detected silence is 1.420 seconds. Master measured loudness is -16.22 LUFS with a -1.81 dBTP true peak. Repetition candidates match intentional script phrasing, rather than an added take or duplicated clip.

Browser delivery QA loads all seven MP4s and VTT tracks, verifies both archive links and the teacher chapter control, checks 1440px/390px layouts with no overflow, and reports zero serious/critical Axe findings or page errors. The local server serves exports only; the private environment path returns 404. Source typecheck, lint (inherited app warnings only), documentation checks, 170 application checks and 13 units pass.

## Acceptance boundary

Automated speech matching, full media decode and inspected frames support the technical/editorial checks listed above. They do not prove an uninterrupted human watch and subjective listening acceptance. That final viewer pass remains **not fully verifiable** in this run; the gallery makes it straightforward for the client to review. Public student confirmation-mail capacity remains the separate open Issue #75 dependency and is not represented as resolved by these videos.
