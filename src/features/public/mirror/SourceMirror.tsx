import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import entries from "./pages.json";
import gaps from "./gaps.json";
import files from "./files.json";
import {
  canonicalSchoolUrl,
  sourceForLocalPath,
  findSchoolPage,
} from "./paths";
import "./mirror.css";

type Entry = {
  source: string;
  title: string;
  route: string;
  file: string;
  aliases: string[];
  links: number;
  capturedOn: string;
  checksum: string;
};
const pages = entries as Entry[];
const displayUrl = (value: string) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};
function findPage(source: string | null) {
  return findSchoolPage(pages, source);
}
function scrollFragment(doc: Document, hash: string) {
  if (!hash) return;
  try {
    doc.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  } catch {
    /* Invalid fragments are inert. */
  }
}
/** Trusted local controls for inert source HTML. Source scripts and submissions never run. */
function configureDocument(doc: Document, navigate: (url: string) => void) {
  const cleanups: Array<() => void> = [];
  // Source animations are inert: render their supplied final values directly.
  const counters = doc.querySelectorAll<HTMLElement>(".elementor-counter-number[data-to-value]");
  counters.forEach((counter) => {
    const raw = counter.dataset.toValue || "";
    if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) return;
    const separator = counter.dataset.delimiter ?? ",";
    counter.textContent = new Intl.NumberFormat("en-US", {
      useGrouping: separator !== "",
      maximumFractionDigits: Math.min(20, raw.split(".")[1]?.length || 0),
    }).format(Number(raw)).replaceAll(",", separator);
    const card = counter.closest<HTMLElement>(".e-con.e-child");
    if (card?.parentElement?.classList.contains("e-grid")) {
      card.classList.add("mirror-stat-card");
      card.parentElement.classList.add("mirror-statistics");
    }
  });
  if (counters.length) {
    const style = doc.createElement("style");
    style.dataset.mirrorStatistics = "true";
    style.textContent = `
      .mirror-statistics { grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:16px!important }
      .mirror-stat-card { box-sizing:border-box;min-width:0;padding:24px 20px!important;border:1px solid #b8d9ce;border-radius:12px;background:#124e42!important;color:#fff!important }
      .mirror-stat-card .elementor-heading-title,.mirror-stat-card .elementor-counter-number-wrapper,.mirror-stat-card .elementor-counter-number,.mirror-stat-card .elementor-counter-number-prefix,.mirror-stat-card .elementor-counter-number-suffix { color:#fff!important }
      .mirror-stat-card .elementor-counter-number-wrapper { justify-content:center;font-size:clamp(30px,3.3vw,64px)!important;line-height:1.2;white-space:nowrap }
      .mirror-stat-card img { max-width:100%;height:auto }
      @media(max-width:980px) { .mirror-statistics { grid-template-columns:repeat(2,minmax(0,1fr))!important } }
      @media(max-width:480px) { .mirror-statistics { grid-template-columns:minmax(0,1fr)!important } }
    `;
    doc.head.append(style);
    cleanups.push(() => style.remove());
  }
  // The captured home page retains Elementor's in-progress scale animation.
  // With scripts disabled, that transform never settles and the ten entrance
  // labels paint over adjacent cards. Restore the final layout in the mirror.
  const homeEntrances = doc.querySelector(".elementor-element-93788b9");
  if (homeEntrances) {
    const style = doc.createElement("style");
    style.dataset.mirrorHomeLayout = "true";
    style.textContent = `
      .elementor-element-93788b9 { width:min(1920px,92%)!important; margin-inline:auto!important; grid-auto-flow:row!important; grid-template-columns:repeat(10,minmax(0,1fr))!important; --e-con-grid-template-columns:repeat(10,minmax(0,1fr))!important }
      .elementor-element-93788b9 > .e-con { min-width:0!important; overflow:hidden }
      .elementor-element-93788b9 .elementor-widget-container { transition:none!important }
      .elementor-element-93788b9 .elementor-image-box-title { font-size:clamp(15px,1.42vw,28px)!important; line-height:1.2!important; white-space:nowrap!important }
      .elementor-element-93788b9 .elementor-image-box-description { font-size:clamp(11px,.9vw,14px)!important; line-height:1.4!important; overflow-wrap:anywhere }
      @media(max-width:1399px) { .elementor-element-93788b9 { grid-template-columns:repeat(5,minmax(0,1fr))!important; --e-con-grid-template-columns:repeat(5,minmax(0,1fr))!important } }
      @media(max-width:767px) { .elementor-element-93788b9 { grid-template-columns:repeat(2,minmax(0,1fr))!important; --e-con-grid-template-columns:repeat(2,minmax(0,1fr))!important } }
      @media(max-width:479px) { .elementor-element-93788b9 { grid-template-columns:minmax(0,1fr)!important; --e-con-grid-template-columns:minmax(0,1fr)!important } .elementor-element-93788b9 .elementor-image-box-title { font-size:28px!important } }
    `;
    doc.head.append(style);
    homeEntrances.querySelectorAll<HTMLElement>(".elementor-widget-container[style*='scale']").forEach((widget) => {
      widget.style.removeProperty("transform");
      widget.style.removeProperty("will-change");
      widget.getAnimations?.().forEach((animation) => animation.cancel());
    });
    cleanups.push(() => style.remove());
  }
  const selectTab = (tab: HTMLElement) => {
    const group = tab.closest("[role=tablist]") || tab.parentElement;
    if (!group) return;
    const tabs = [...group.querySelectorAll<HTMLElement>("[role=tab]")];
    tabs.forEach((t) => {
      const active = t === tab;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
      t.classList.toggle("active", active);
    });
    const trigger = tab.dataset.trigger;
    if (trigger)
      doc
        .querySelectorAll<HTMLElement>(".newsword")
        .forEach((p) =>
          p.classList.toggle(
            "hide",
            !p.classList.contains("newsword--" + trigger),
          ),
        );
    else
      tabs.forEach((t) => {
        const panel = doc.getElementById(t.getAttribute("aria-controls") || "");
        if (panel) {
          const active = t === tab;
          panel.classList.toggle("e-active", active);
          panel.hidden = !active;
          panel.setAttribute("aria-hidden", String(!active));
        }
      });
  };
  const click = (event: MouseEvent) => {
    const target =
      event.target && (event.target as Element).nodeType === 1
        ? (event.target as Element)
        : null;
    const sidr = target?.closest<HTMLElement>("#simple-menu");
    if (sidr) {
      event.preventDefault();
      const menu =
        doc.getElementById("sidr-main") ||
        doc.getElementById("sidr") ||
        doc.querySelector<HTMLElement>(".sidr");
      if (menu) {
        const open = sidr.getAttribute("aria-expanded") !== "true";
        sidr.setAttribute("aria-expanded", String(open));
        sidr.setAttribute("aria-label", "Menu");
        menu.style.display = open ? "block" : "none";
        menu.style.position = "fixed";
        menu.style.top = "0";
        menu.style.bottom = "0";
        menu.style.left = "auto";
        menu.style.right = open ? "0" : "-300px";
        menu.style.maxWidth = "85vw";
        menu.style.zIndex = "99999";
        menu.style.overflow = "auto";
      }
      return;
    }
    const popup = target?.closest<HTMLElement>(
      "[aria-haspopup=menu][aria-controls],.dropdown-toggle[data-toggle=dropdown]",
    );
    if (popup) {
      event.preventDefault();
      const panel =
        doc.getElementById(popup.getAttribute("aria-controls") || "") ||
        popup.parentElement?.querySelector<HTMLElement>(".dropdown-menu");
      if (panel) {
        const open = popup.getAttribute("aria-expanded") !== "true";
        doc
          .querySelectorAll<HTMLElement>(
            "[aria-haspopup=menu][aria-expanded=true]",
          )
          .forEach((other) => {
            if (other !== popup) {
              other.setAttribute("aria-expanded", "false");
              const old = doc.getElementById(
                other.getAttribute("aria-controls") || "",
              );
              if (old) {
                old.style.display = "none";
                old.setAttribute("aria-hidden", "true");
              }
            }
          });
        popup.setAttribute("aria-expanded", String(open));
        panel.style.display = open ? "block" : "none";
        panel.setAttribute("aria-hidden", String(!open));
        if (open && panel.classList.contains("el-popper")) {
          const rect = popup.getBoundingClientRect();
          panel.style.position = "fixed";
          panel.style.inset = "auto";
          panel.style.top = rect.bottom + "px";
          panel.style.left =
            Math.max(
              8,
              Math.min(
                rect.left,
                (doc.defaultView?.innerWidth || 1280) - panel.offsetWidth - 8,
              ),
            ) + "px";
        }
      }
      return;
    }
    const subArrow = target?.closest<HTMLElement>(".sub-arrow");
    if (subArrow) {
      event.preventDefault();
      const anchor = subArrow.closest("a"),
        menu = anchor?.parentElement?.querySelector<HTMLElement>(".sub-menu");
      if (menu) {
        const open = anchor?.getAttribute("aria-expanded") !== "true";
        anchor?.setAttribute("aria-expanded", String(open));
        menu.style.display = open ? "block" : "none";
      }
      return;
    }
    const tab = target?.closest<HTMLElement>("[role=tab]");
    if (tab) {
      event.preventDefault();
      selectTab(tab);
      return;
    }
    const toggle = target?.closest<HTMLElement>(
      '.elementor-menu-toggle,.menu-toggle,.navbar-toggle,[data-toggle="collapse"],.elementskit-menu-hamburger',
    );
    if (toggle) {
      event.preventDefault();
      const root =
        toggle.closest(".elementor-widget-nav-menu,.navbar,.ekit-wid-con") ||
        toggle.parentElement;
      const id = (
        toggle.getAttribute("data-target") ||
        toggle.getAttribute("aria-controls") ||
        ""
      ).replace(/^#/, "");
      const menu =
        (id ? doc.getElementById(id) : null) ||
        root?.querySelector<HTMLElement>(
          ".elementor-nav-menu--dropdown,.navbar-collapse,.elementskit-menu-container,.nav-menu,.menu",
        );
      if (menu) {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        toggle.classList.toggle("elementor-active", open);
        menu.classList.toggle("in", open);
        menu.classList.toggle("elementskit-menu-offcanvas-elements", open);
        menu.style.display = open ? "block" : "none";
        menu.style.maxHeight = open ? "80vh" : "0";
        menu.style.overflow = "auto";
      }
      return;
    }
    const accordion = target?.closest<HTMLElement>(
      ".elementor-tab-title[aria-controls]",
    );
    if (accordion) {
      event.preventDefault();
      const panel = doc.getElementById(
        accordion.getAttribute("aria-controls") || "",
      );
      const open = accordion.getAttribute("aria-expanded") !== "true";
      accordion.setAttribute("aria-expanded", String(open));
      accordion.classList.toggle("elementor-active", open);
      if (panel) {
        panel.style.display = open ? "block" : "none";
        panel.hidden = !open;
      }
      return;
    }
    const anchor = target?.closest<HTMLAnchorElement>("a[href],area[href]");
    if (anchor?.dataset.mirrorInert) {
      event.preventDefault();
      return;
    }
    const card = target?.closest<HTMLElement>("[data-mirror-link]");
    const raw = anchor?.getAttribute("href") || card?.dataset.mirrorLink;
    if (raw?.startsWith("#")) {
      event.preventDefault();
      navigate(window.location.pathname + window.location.search + raw);
      scrollFragment(doc, raw);
      return;
    }
    if (raw?.startsWith("/school-assets/")) {
      event.preventDefault();
      window.open(raw, "_blank", "noopener,noreferrer");
      return;
    }
    if (raw?.startsWith("/") && !raw.startsWith("//")) {
      event.preventDefault();
      navigate(raw);
      return;
    }
    if (anchor?.dataset.thirdParty === "true") {
      event.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
    }
  };
  doc.addEventListener("click", click);
  cleanups.push(() => doc.removeEventListener("click", click));
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const el =
      event.target && (event.target as HTMLElement).nodeType === 1
        ? (event.target as HTMLElement)
        : null;
    if (event.key === "Enter" && el?.dataset.mirrorLink) {
      event.preventDefault();
      navigate(el.dataset.mirrorLink);
    }
    if (
      el?.getAttribute("role") === "tab" &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      const group = el.closest("[role=tablist]") || el.parentElement,
        tabs = [...(group?.querySelectorAll<HTMLElement>("[role=tab]") || [])],
        index = tabs.indexOf(el);
      const next =
        tabs[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                tabs.length
        ];
      if (next) {
        event.preventDefault();
        selectTab(next);
        next.focus();
      }
    }
    if (
      ["Enter", " "].includes(event.key) &&
      el?.matches("[role=button]:not(button),.elementor-menu-toggle")
    ) {
      event.preventDefault();
      el.click();
    }
    if (event.key === "Escape")
      doc
        .querySelectorAll<HTMLElement>(
          ".elementor-menu-toggle[aria-expanded=true],.navbar-toggle[aria-expanded=true],#simple-menu[aria-expanded=true],[aria-haspopup=menu][aria-expanded=true]",
        )
        .forEach((e) => {
          e.click();
          e.focus();
        });
  };
  doc.addEventListener("keydown", key);
  cleanups.push(() => doc.removeEventListener("keydown", key));
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.dataset.mirrorForm === "search") {
      const q = form.querySelector<HTMLInputElement>(
        "input[type=search],input[name=s],input[name=search]",
      )?.value;
      if (q?.trim())
        navigate(
          "/local-pages?q=" + encodeURIComponent(q.trim().slice(0, 200)),
        );
    }
  };
  doc.addEventListener("submit", submit);
  cleanups.push(() => doc.removeEventListener("submit", submit));
  doc
    .querySelectorAll<HTMLElement>(".swiper,.swiper-container")
    .forEach((slider) => {
      const wrapper = slider.querySelector<HTMLElement>(".swiper-wrapper");
      if (!wrapper) return;
      wrapper
        .querySelectorAll(":scope>.swiper-slide-duplicate")
        .forEach((e) => e.remove());
      const slides = [...wrapper.children].filter((e) =>
        e.classList.contains("swiper-slide"),
      ) as HTMLElement[];
      if (!slides.length) return;
      const widget = slider.closest<HTMLElement>("[data-mirror-settings]");
      let settings: Record<string, number> = {};
      try {
        settings = JSON.parse(widget?.dataset.mirrorSettings || "{}");
      } catch {
        /* Single slide default. */
      }
      const region = slider.parentElement || slider,
        bullets = [
          ...region.querySelectorAll<HTMLElement>(".swiper-pagination-bullet"),
        ];
      let current = 0;
      const render = () => {
        const width = doc.defaultView?.innerWidth || 1280,
          view = Math.min(
            slides.length,
            Number(
              width < 768
                ? settings.slides_to_show_mobile
                : width < 1024
                  ? settings.slides_to_show_tablet
                  : settings.slides_to_show,
            ) || 1,
          );
        current = Math.min(current, Math.max(0, slides.length - view));
        slides.forEach((slide, i) => {
          slide.style.width = `${100 / view}%`;
          slide.style.flex = `0 0 ${100 / view}%`;
          slide.style.display =
            i >= current && i < current + view ? "block" : "none";
          slide.style.opacity = "1";
          slide.setAttribute(
            "aria-hidden",
            String(i < current || i >= current + view),
          );
        });
        wrapper.style.transform = "none";
        wrapper.style.width = "100%";
        wrapper.style.display = "flex";
        wrapper.style.transition = "none";
        bullets.forEach((b, i) => {
          b.classList.toggle("swiper-pagination-bullet-active", i === current);
          b.setAttribute("aria-current", String(i === current));
        });
      };
      render();
      const bind = (control: HTMLElement, change: () => void) => {
        control.setAttribute("role", "button");
        control.tabIndex = 0;
        control.addEventListener("click", change);
        const press = (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            change();
          }
        };
        control.addEventListener("keydown", press);
        cleanups.push(() => {
          control.removeEventListener("click", change);
          control.removeEventListener("keydown", press);
        });
      };
      for (const [selector, direction] of [
        [".elementor-swiper-button-next,.swiper-button-next", 1],
        [".elementor-swiper-button-prev,.swiper-button-prev", -1],
      ] as const) {
        const control = region.querySelector<HTMLElement>(selector);
        if (control)
          bind(control, () => {
            current = (current + direction + slides.length) % slides.length;
            render();
          });
      }
      bullets.forEach((b, i) =>
        bind(b, () => {
          current = i;
          render();
        }),
      );
      doc.defaultView?.addEventListener("resize", render);
      cleanups.push(() =>
        doc.defaultView?.removeEventListener("resize", render),
      );
    });
  doc.documentElement.dataset.mirrorReady = "true";
  return () => cleanups.forEach((fn) => fn());
}
export function LocalPageIndex() {
  const location = useLocation(),
    [query, setQuery] = useState(
      new URLSearchParams(location.search).get("q") || "",
    ),
    [texts, setTexts] = useState<Array<{ route: string; text: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/school-pages/search.json", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then(setTexts)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const needle = query.toLocaleLowerCase(),
    results = pages.filter((p) =>
      (
        p.title +
        " " +
        displayUrl(p.source) +
        " " +
        (texts.find((t) => t.route === p.route)?.text || "")
      )
        .toLocaleLowerCase()
        .includes(needle),
    );
  return (
    <main className="mirror-index">
      <h1>本地校園網站 · Local school pages</h1>
      <p>
        {pages.length} public pages copied. Private school systems require their
        own authorized integration.
      </p>
      <Input
        aria-label="Search copied pages"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋頁面 · Search pages"
      />
      <p>{results.length} results</p>
      <ul>
        {results.map((p) => (
          <li key={p.source}>
            <Link to={p.route}>{p.title}</Link>
            <small>
              {new URL(p.source).hostname} · captured {p.capturedOn}
            </small>
          </li>
        ))}
      </ul>
    </main>
  );
}
export default function SourceMirror() {
  const location = useLocation();
  const source = sourceForLocalPath(location.pathname, location.search);
  const entry = findPage(source);
  const file = files.find((a) => canonicalSchoolUrl(a.source) === source);
  const status = gaps.find((r) => r.source === source)?.status;
  useEffect(() => { if (!entry) document.title = "Local page not copied yet"; }, [entry]);
  if (!entry)
    return (
      <main className="mirror-index">
        <h1>
          {file
            ? "本地文件 · Local document"
            : "此頁面尚未完成複製 · Page not copied yet"}
        </h1>
        {file ? (
          <a href={file.file} target="_blank" rel="noreferrer">
            Open copied document
          </a>
        ) : (
          <>
            <p>
              This destination{" "}
              {status === "requires-auth-integration" ||
              status === "local-ui-preview"
                ? "requires a separate school integration"
                : status === "source-unavailable"
                  ? "could not be retrieved from the source"
                  : "has not been imported yet"}
              . It is not counted as a completed copy.
            </p>
            {source ? <p>{displayUrl(source)}</p> : null}
          </>
        )}
        <Link to="/local-pages">Browse copied pages</Link>
        <Link to="/">Return home</Link>
        {source && !file ? (
          <a href={source} target="_blank" rel="noreferrer">
            Original source (external)
          </a>
        ) : null}
      </main>
    );
  return <SourcePage key={entry.file + entry.checksum + location.pathname + location.search} entry={entry} />;
}
function SourcePage({ entry }: { entry: Entry }) {
  const location = useLocation(), navigate = useNavigate(),
    frame = useRef<HTMLIFrameElement>(null),
    cleanup = useRef<(() => void) | null>(null),
    [error, setError] = useState(""),
    [readyPage, setReadyPage] = useState("");
  const pageFile = entry?.file,
    pageTitle = entry?.title,
    pageVersion = entry?.checksum,
    pageKey = (pageFile || "") + (pageVersion || "") + location.pathname + location.search;
  useLayoutEffect(() => {
    document.title = pageTitle
      ? pageTitle + " · local copy"
      : "Local page not copied yet";
    const iframe = frame.current;
    if (!iframe || !pageFile) return;
    let disposed = false;
    let bound: Document | null = null;
    let configuredAfterParse = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const bind = () => {
      if (disposed) return false;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || new URL(doc.URL).pathname !== pageFile) return false;
      // A missing static capture is rewritten to the SPA shell by Vercel.
      // Never mistake that shell for the requested school page.
      if (doc.querySelector("[data-stu-boot]")) {
        setError("The copied page is unavailable. Please retry or return home.");
        return true;
      }
      if (doc.readyState === "loading" && (doc.body.textContent?.trim().length || 0) < 100)
        return false;
      if (bound !== doc || (!configuredAfterParse && doc.readyState !== "loading")) {
        cleanup.current?.();
        cleanup.current = configureDocument(doc, (url) => navigate(url));
        bound = doc;
        configuredAfterParse = doc.readyState !== "loading";
        if (!configuredAfterParse)
          doc.addEventListener("DOMContentLoaded", bind, { once: true });
        scrollFragment(doc, window.location.hash);
      }
      setReadyPage(pageKey);
      setError("");
      return true;
    };
    const poll = () => {
      if (bind()) return;
      if (Date.now() - started >= 30000) {
        setError("The local page could not be loaded. Please retry.");
        return;
      }
      timer = setTimeout(poll, 25);
    };
    // Bind once the body exists. A slow stylesheet can hold readyState at
    // "loading" long after the page's visible content and links are available.
    timer = setTimeout(poll, 0);
    iframe.addEventListener("load", bind);
    return () => {
      disposed = true;
      clearTimeout(timer);
      iframe.removeEventListener("load", bind);
      cleanup.current?.();
      cleanup.current = null;
    };
  }, [pageFile, pageTitle, pageVersion, pageKey, navigate]);
  useEffect(() => {
    if (frame.current?.contentDocument)
      scrollFragment(frame.current.contentDocument, location.hash);
  }, [location.hash]);
  return (
    <section
      className="source-mirror"
      aria-label={entry.title}
      key={pageKey}
      aria-busy={readyPage !== pageKey}
    >
      {error ? (
        <div role="alert" className="mirror-load-error">
          {error}
          <Button
            onClick={() => frame.current?.contentWindow?.location.reload()}
          >
            Retry
          </Button>
          <Button asChild variant="outline"><Link to="/">Return home</Link></Button>
        </div>
      ) : null}
      {readyPage !== pageKey && !error ? <div className="mirror-loading" role="status">載入頁面…</div> : null}
      <iframe
        ref={frame}
        title={entry.title}
        src={entry.file + "?v=" + entry.checksum.slice(0, 12)}
        sandbox="allow-same-origin allow-downloads"
        onError={() => setError("The local page could not be loaded.")}

      />
    </section>
  );
}
