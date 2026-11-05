import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { Input } from "@/components/ui/input";
import entries from "./pages.json";
import gaps from "./gaps.json";
import files from "./files.json";
import { canonicalSchoolUrl, findSchoolPage, sourceForLocalPath } from "./paths";
import "./mirror.css";

type Page = { source: string; title: string; route: string; file: string; aliases: string[]; capturedOn: string };
const pages = entries as Page[];
const documentFiles = files as Array<{ source: string; file: string }>;
const unavailable = gaps as Array<{ source: string; status: string }>;

export function LocalPageIndex() {
  const location = useLocation();
  const [query, setQuery] = useState(new URLSearchParams(location.search).get("q") || "");
  const [texts, setTexts] = useState<Array<{ route: string; text: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/school-pages/search.json", { signal: controller.signal })
      .then(response => response.ok ? response.json() : [])
      .then(setTexts)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const results = useMemo(() => {
    const textByRoute = new Map(texts.map(item => [item.route, item.text]));
    const needle = query.toLocaleLowerCase();
    return pages.filter(page => `${page.title} ${page.source} ${textByRoute.get(page.route) || ""}`.toLocaleLowerCase().includes(needle));
  }, [query, texts]);
  return <main className="mirror-index">
    <h1>本地校園網站 · Local school pages</h1>
    <p>{pages.length} public pages copied. Private school systems require their own authorized integration.</p>
    <Input aria-label="Search copied pages" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋頁面 · Search pages" />
    <p>{results.length} results</p>
    <ul>{results.map(page => <li key={page.source}><a href={page.route}>{page.title}</a><small>{new URL(page.source).hostname} · captured {page.capturedOn}</small></li>)}</ul>
  </main>;
}

/** The SPA only handles uncopied paths. Copied pages are direct HTML documents. */
export default function SourceMirror() {
  const location = useLocation();
  const source = sourceForLocalPath(location.pathname, location.search);
  const page = findSchoolPage(pages, source);
  const documentFile = documentFiles.find(item => canonicalSchoolUrl(item.source) === source);
  const status = unavailable.find(item => item.source === source)?.status;
  useEffect(() => { document.title = page ? `${page.title} · local copy` : "Local page not copied yet"; }, [page]);
  return <main className="mirror-index">
    <h1>{page ? "Copied page available" : documentFile ? "本地文件 · Local document" : "此頁面尚未完成複製 · Page not copied yet"}</h1>
    {page ? <p>The copied page is a direct document. <a href={page.route}>Open the page</a> or <a href={page.file}>open the captured HTML</a>.</p>
      : documentFile ? <a href={documentFile.file} target="_blank" rel="noreferrer">Open copied document</a>
      : <p>{status === "requires-auth-integration" || status === "local-ui-preview" ? "This destination requires a separate school integration." : status === "source-unavailable" ? "This destination could not be retrieved from the source." : "This destination has not been imported yet."}</p>}
    {source ? <p>{source}</p> : null}
    <a href="/local-pages">Browse copied pages</a>
    <a href="/">Return home</a>
  </main>;
}
