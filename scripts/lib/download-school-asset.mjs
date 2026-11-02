/** Read-only importer for observed public media URLs. Never a runtime website proxy. */
export function safeSchoolAssetUrl(value) {
  try {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (!u.port || ["80", "443"].includes(u.port)) &&
      (u.hostname === "stu.edu.tw" ||
        u.hostname.endsWith(".stu.edu.tw") ||
        [
          "fonts.googleapis.com",
          "fonts.gstatic.com",
          "i.ytimg.com",
          "use.fontawesome.com",
          "maxcdn.bootstrapcdn.com",
          "s.w.org",
          "secure.gravatar.com",
          "scdn.line-apps.com",
          "ap9.ragic.com",
        ].includes(u.hostname))
    );
  } catch {
    return false;
  }
}
export async function downloadSchoolAsset(
  url,
  { timeout = 20000, maxBytes = 25 * 1024 * 1024 } = {},
) {
  if (!safeSchoolAssetUrl(url)) throw Error("Unapproved asset host");
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Error("Asset request timed out"));
    }, timeout);
  });
  const operation = (async () => {
    let target = url,
      response;
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (!safeSchoolAssetUrl(target)) throw Error("Unapproved asset redirect");
      response = await fetch(target, {
        signal: controller.signal,
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw Error("Redirect has no location");
        target = new URL(location, target).href;
        continue;
      }
      break;
    }
    if (!response?.ok) throw Error("HTTP " + response?.status);
    if (Number(response.headers.get("content-length") || 0) > maxBytes) {
      await response.body?.cancel();
      throw Error("Asset exceeds import size limit");
    }
    const type = response.headers.get("content-type") || "";
    if (/text\/html/i.test(type)) {
      await response.body?.cancel();
      throw Error("HTML response instead of a static asset");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      controller.signal.throwIfAborted();
      size += chunk.length;
      if (size > maxBytes) throw Error("Asset exceeds import size limit");
      chunks.push(chunk);
    }
    controller.signal.throwIfAborted();
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw Error("Empty response");
    return { buffer, type };
  })();
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Scheme aliases share content, but query strings can select different documents. */
export function schoolAssetIdentity(value) {
  const u = new URL(value);
  u.hash = "";
  return u.href.replace(/^https?:/, "");
}
