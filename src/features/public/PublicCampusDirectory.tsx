import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { CheckboxField } from "@/components/form-controls";
import { Card } from "@/components/ui/card";
import {
  listCampusPlaces,
  requestCampusRoute,
  type CampusDirectoryPlace,
  type CampusRoute,
} from "../../services/campusNavigation";

/** Existing verified campus API, kept independent of the source-site iframe. */
export function PublicCampusDirectory() {
  const [open, setOpen] = useState(false),
    [places, setPlaces] = useState<CampusDirectoryPlace[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [origin, setOrigin] = useState(""),
    [destination, setDestination] = useState(""),
    [wheelchair, setWheelchair] = useState(false),
    [route, setRoute] = useState<CampusRoute | null>(null);
  const controller = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function close(value: boolean) {
    setOpen(value);
    if (!value) {
      controller.current?.abort();
      setLoading(false);
    }
  }
  async function load() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setOpen(true);
    setLoading(true);
    setError("");
    setRoute(null);
    try {
      const data = await listCampusPlaces(
        AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      );
      if (!request.signal.aborted) setPlaces(data);
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "目前無法載入校園地點。");
    } finally {
      if (controller.current === request && !request.signal.aborted)
        setLoading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    setRoute(null);
    try {
      const result = await requestCampusRoute(
        origin,
        destination,
        wheelchair,
        AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      );
      if (
        !result.origin ||
        !result.destination ||
        !Array.isArray(result.steps) ||
        !Number.isFinite(result.distanceMeters)
      )
        throw Error("無法載入已驗證的路線。");
      if (!request.signal.aborted) setRoute(result);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error ? e.message : "目前沒有符合條件的驗證路線。",
        );
    } finally {
      if (controller.current === request && !request.signal.aborted)
        setLoading(false);
    }
  }
  return (
    <>
      <Button
        ref={launcher}
        className="fixed bottom-16 right-4 z-20 shadow-md"
        size="sm"
        variant="outline"
        aria-label="開啟校園導覽"
        onClick={() => void load()}
      >
        <MapPin className="size-4" />
        校園導覽
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launcher.current?.focus();
          }}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        >
          <section className="campus-directory-panel grid gap-4">
            <header className="flex items-center justify-between gap-3">
              <DialogTitle>驗證地點與文字路線</DialogTitle>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="關閉校園導覽"
                onClick={() => close(false)}
              >
                <X className="size-4" />
              </Button>
            </header>
            <DialogDescription>
              使用已驗證的校園地點和路線；不以模型產生的位置取代官方資料。
            </DialogDescription>
            <form
              onSubmit={(e) => void submit(e)}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Label className="grid gap-2">
                起點
                <NativeSelect
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  required
                >
                  <NativeSelectOption value="">選擇起點</NativeSelectOption>
                  {places
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <NativeSelectOption key={p.id} value={p.code}>
                        {p.name_zh} · {p.name_en}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Label>
              <Label className="grid gap-2">
                目的地
                <NativeSelect
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                >
                  <NativeSelectOption value="">選擇目的地</NativeSelectOption>
                  {places
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <NativeSelectOption key={p.id} value={p.code}>
                        {p.name_zh} · {p.name_en}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Label>
              <Label className="flex items-center gap-2 sm:col-span-2">
                <CheckboxField
                  checked={wheelchair}
                  onChange={(e) => setWheelchair(e.target.checked)}
                />
                只使用無障礙路線（避開樓梯與不適用通道）
              </Label>
              <Button
                type="submit"
                disabled={loading || !origin || !destination}
              >
                {loading ? "正在驗證路線…" : "建立文字路線"}
              </Button>
            </form>
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            {loading ? <p role="status">正在載入…</p> : null}
            {!loading && !places.length && !error ? (
              <p>官方地點資料正在建置。系統不會以近似位置取代官方資料。</p>
            ) : null}
            {route ? (
              <Card
                className="campus-route-result grid gap-3 p-4"
                aria-live="polite"
              >
                <h3 className="font-semibold">
                  {route.origin.name_zh} → {route.destination.name_zh}
                </h3>
                <p>
                  {route.distanceMeters} m · 約{" "}
                  {Math.max(1, Math.ceil(route.estimatedSeconds / 60))} 分鐘
                </p>
                {route.steps.length ? (
                  <ol className="list-decimal space-y-3 pl-5">
                    {route.steps.map((s) => (
                      <li key={s.edgeId}>
                        <p>{s.instructionZh}</p>
                        <small className="text-muted-foreground">
                          {s.instructionEn} · {s.distanceMeters} m
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>您已在目的地。</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {route.disclaimer}
                </p>
              </Card>
            ) : null}
            {places.length ? (
              <section className="grid gap-3">
                <h3 className="font-semibold">已驗證地點</h3>
                {places.map((p) => (
                  <Card key={p.id} className="grid gap-1 p-4">
                    <strong>{p.name_zh}</strong>
                    <span>
                      {p.name_en} · {p.code}
                    </span>
                    <p>{p.description_zh}</p>
                    {p.status === "temporarily_closed" ? (
                      <p>{p.closure_reason}</p>
                    ) : null}
                    {p.source?.canonical_url ? (
                      <a
                        className="text-sm underline"
                        href={p.source.canonical_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        官方來源（外部）
                      </a>
                    ) : null}
                  </Card>
                ))}
              </section>
            ) : null}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
