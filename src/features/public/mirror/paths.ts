/** Pure build/runtime URL policy. This never fetches an arbitrary remote page. */
export function canonicalSchoolUrl(
  value: string,
  base = "https://www.stu.edu.tw/",
): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      return null;
    if (
      !(url.hostname === "stu.edu.tw" || url.hostname.endsWith(".stu.edu.tw"))
    )
      return null;
    url.protocol = "https:";
    if (url.hostname === "stu.edu.tw") url.hostname = "www.stu.edu.tw";
    if (url.hostname === "oica.stu.edu.tw")
      url.hostname = "www.oica.stu.edu.tw";
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (
        /^(?:code|state|ticket)$|token|password|session|saml|relay|nonce/i.test(
          key,
        )
      )
        url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/%[a-f\d]{2}/gi, (code) =>
      code.toUpperCase(),
    );
    return url.href;
  } catch {
    return null;
  }
}
export function localSchoolHref(
  value: string,
  base = "https://www.stu.edu.tw/",
): string | null {
  try {
    const target = new URL(value, base);
    if (
      target.protocol === "https:" &&
      !target.username &&
      !target.password &&
      target.hostname === "mail.google.com" &&
      target.pathname.replace(/\/$/, "") === "/a/stu.edu.tw"
    )
      return "/student-sso";
  } catch {
    return null;
  }
  const canonical = canonicalSchoolUrl(value, base);
  if (!canonical) return null;
  const url = new URL(canonical),
    original = new URL(value, base),
    hash = original.hash;
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (
    url.hostname === "info.stu.edu.tw" &&
    ["/", "/eportal/index.asp", "/eportal/login.asp"].includes(
      path.toLowerCase(),
    )
  )
    return (
      (path.toLowerCase().endsWith("login.asp")
        ? "/school-affairs/login"
        : "/school-affairs") + hash
    );
  if (url.hostname === "sso2.stu.edu.tw") return "/student-sso";
  if (url.hostname === "dtm.stu.edu.tw" && (path === "/" || path.toLowerCase() === "/login/index.php"))
    return (path === "/" ? "/dtm" : "/dtm/login") + hash;
  if (url.hostname === "www.stu.edu.tw") {
    const reserved =
      /^\/(?:app|crm|login|signin|signup|auth|study|api|assets|school-assets|school-pages|students|student-sso|school-affairs|admissions|freshman|international|alumni-association|local-pages|school-sites)(?:\/|$)/i.test(
        url.pathname,
      );
    return (
      (reserved ? "/school-sites/www.stu.edu.tw" : "") +
      url.pathname +
      url.search +
      hash
    );
  }
  if (path === "/" && !url.search) {
    const roots: Record<string, string> = {
      "reg.aca.stu.edu.tw": "/admissions",
      "freshman.stu.edu.tw": "/freshman",
      "alumnus.sao.stu.edu.tw": "/alumni-association",
      "www.oica.stu.edu.tw": "/international",
    };
    if (roots[url.hostname]) return roots[url.hostname] + hash;
  }
  if (url.hostname === "www.oica.stu.edu.tw" && path === "/en" && !url.search)
    return "/international" + hash;
  return "/school-sites/" + url.hostname + url.pathname + url.search + hash;
}
export function sourceForLocalPath(
  pathname: string,
  search = "",
): string | null {
  const roots: Record<string, string> = {
    "/admissions": "https://reg.aca.stu.edu.tw/",
    "/freshman": "https://freshman.stu.edu.tw/",
    "/alumni-association": "https://alumnus.sao.stu.edu.tw/",
    "/international": "https://www.oica.stu.edu.tw/en/",
  };
  const clean = pathname.replace(/\/$/, "") || "/";
  if (roots[clean]) return canonicalSchoolUrl(roots[clean] + search);
  if (pathname.startsWith("/school-sites/")) {
    const rest = pathname.slice("/school-sites/".length),
      slash = rest.indexOf("/"),
      host = slash < 0 ? rest : rest.slice(0, slash),
      path = slash < 0 ? "/" : rest.slice(slash);
    return canonicalSchoolUrl("https://" + host + path + search);
  }
  return canonicalSchoolUrl("https://www.stu.edu.tw" + pathname + search);
}

/** Canonical page content is authoritative when an old redirect alias conflicts. */
export function findSchoolPage<T extends { source: string; aliases: string[] }>(
  pages: T[],
  source: string | null,
): T | undefined {
  if (!source) return undefined;
  return (
    pages.find((p) => p.source === source) ||
    pages.find((p) =>
      p.aliases.some((alias) => canonicalSchoolUrl(alias) === source),
    )
  );
}
