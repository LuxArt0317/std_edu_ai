import { useEffect, useState } from "react";
import { PlayCircle, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlatformRole } from "../types";
import {
  guideDownloadUrl,
  loadVideoGuideUrls,
  recommendedGuides,
  videoGuides,
  type GuideAssetUrls,
} from "./videoGuideService";
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export function VideoGuidesView({ role }: { role: PlatformRole }) {
  const [selectedId, setSelectedId] = useState(
    () => recommendedGuides(role)[0]?.id ?? "Overview",
  );
  const [filter, setFilter] = useState("recommended");
  const [urls, setUrls] = useState<GuideAssetUrls>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const recommended = recommendedGuides(role);
  const selected =
    videoGuides.find((guide) => guide.id === selectedId) ?? recommended[0];
  const visible = filter === "recommended" ? recommended : videoGuides;
  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const next = await loadVideoGuideUrls();
        if (current) {
          setUrls(next);
          setError("");
        }
      } catch (reason) {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : "The videos could not be loaded.",
          );
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 50 * 60 * 1000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [revision]);
  function retry() {
    setError("");
    setLoading(true);
    setRevision((value) => value + 1);
  }
  return (
    <section className="video-guides space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Video guides</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Follow a walkthrough for your role, or browse every guide.
        </p>
      </header>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading videos…
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-card p-4"
        >
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="min-w-0 gap-0 overflow-hidden py-0">
          <CardContent className="min-w-0 p-0">
            {urls[selected.assets.mp4.path] ? (
              <video
                key={selected.id}
                className="aspect-video w-full bg-black"
                controls
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                src={urls[selected.assets.mp4.path]}
                aria-label={selected.title}
                onError={() =>
                  setError(
                    "Playback stopped. Reload the video links and try again.",
                  )
                }
              >
                <track
                  kind="captions"
                  src={urls[selected.assets.vtt.path]}
                  srcLang="en"
                  label="English"
                />
                Your browser does not support video playback.
              </video>
            ) : (
              <div className="grid aspect-video place-items-center bg-muted px-6 text-center text-sm text-muted-foreground">
                {loading
                  ? "Loading the walkthrough…"
                  : "The video will appear here when it is available."}
              </div>
            )}
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <Badge variant="secondary">{duration(selected.duration)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {selected.audience} · English narration and captions
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                {urls[selected.assets.mp4.path] ? (
                  <a
                    className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
                    href={guideDownloadUrl(
                      urls[selected.assets.mp4.path],
                      selected.assets.mp4.filename,
                    )}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Download video
                  </a>
                ) : null}
                {urls[selected.assets.srt.path] ? (
                  <a
                    className="text-primary underline underline-offset-4"
                    href={guideDownloadUrl(
                      urls[selected.assets.srt.path],
                      selected.assets.srt.filename,
                    )}
                  >
                    Download captions
                  </a>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={retry}
                  disabled={loading}
                >
                  Reload videos
                </Button>
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Read transcript
                </summary>
                <div className="mt-4 space-y-4 text-sm">
                  {selected.transcript.map((scene, index) => (
                    <div key={index}>
                      <h3 className="font-medium">{scene.title}</h3>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        {scene.text}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
        <div className="min-w-0">
          <div
            role="group"
            aria-label="Video guide filter"
            className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            <Button
              variant={filter === "recommended" ? "secondary" : "ghost"}
              aria-pressed={filter === "recommended"}
              onClick={() => setFilter("recommended")}
            >
              For your role
            </Button>
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All guides
            </Button>
          </div>
          <div
            role="group"
            aria-label="Choose a video guide"
            className="space-y-2"
          >
            {visible.map((guide) => (
              <Button
                key={guide.id}
                variant={guide.id === selected.id ? "secondary" : "outline"}
                aria-pressed={guide.id === selected.id}
                onClick={() => {
                  setSelectedId(guide.id);
                  setError("");
                }}
                className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal px-3 py-3 text-left"
              >
                <PlayCircle className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-medium">
                    {guide.title}
                  </strong>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {guide.audience}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {duration(guide.duration)}
                </span>
              </Button>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Recorded with demonstration accounts and sample records. Pauses are
            shortened. Important AI-assisted changes still require review.
          </p>
        </div>
      </div>
    </section>
  );
}
