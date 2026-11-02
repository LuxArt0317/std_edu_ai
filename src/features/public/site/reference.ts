import assets from "./assets.json";

export function referenceAsset(url: string): string {
  return (assets as Record<string, string>)[url] ?? url;
}

/** Only the requested copied entry destinations are mapped locally. Other original links are retained. */
export function referenceHref(href: string): string {
  try {
    const url = new URL(href, "https://www.stu.edu.tw");
    if (
      url.hostname === "info.stu.edu.tw" &&
      ["/", "/eportal/login.asp", "/eportal/index.asp"].includes(
        url.pathname.toLowerCase(),
      )
    )
      return "/school-affairs";
    if (
      ["www.stu.edu.tw", "stu.edu.tw"].includes(url.hostname) &&
      decodeURIComponent(url.pathname).replace(/\/$/, "") === "/在校學生"
    )
      return "/在校學生/";
    if (
      (url.hostname === "mail.google.com" &&
        url.pathname.replace(/\/$/, "") === "/a/stu.edu.tw") ||
      url.hostname === "sso2.stu.edu.tw"
    )
      return "/student-sso";
    return href;
  } catch {
    return href;
  }
}
