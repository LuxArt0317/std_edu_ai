import { supabase } from "../../../utils/supabase";
import catalogue from "./video-guide-catalog.json";
import type { PlatformRole } from "../types";

export const videoGuides = catalogue.guides;
export type VideoGuide = (typeof videoGuides)[number];
export type GuideAssetUrls = Record<string, string>;
export function recommendedGuides(role: PlatformRole) {
  const preferred = videoGuides.filter((guide) => guide.roles.includes(role));
  return [
    ...preferred,
    ...videoGuides.filter((guide) => guide.id === "Overview"),
  ];
}
export async function loadVideoGuideUrls(): Promise<GuideAssetUrls> {
  if (!supabase)
    throw new Error("Video guides require a connected school account.");
  const paths = videoGuides.flatMap((guide) =>
    Object.values(guide.assets).map((asset) => asset.path),
  );
  const { data, error } = await supabase.storage
    .from(catalogue.bucket)
    .createSignedUrls(paths, 3600);
  if (error || !data)
    throw new Error(
      "The videos could not be loaded. Check your connection and try again.",
    );
  const urls: GuideAssetUrls = {};
  for (const item of data) {
    if (item.error || !item.path || !item.signedUrl)
      throw new Error(
        "A video is unavailable. Please try again or contact the school.",
      );
    urls[item.path] = item.signedUrl;
  }
  return urls;
}
export function guideDownloadUrl(url: string | undefined, filename: string) {
  if (!url) return undefined;
  const download = new URL(url);
  download.searchParams.set("download", filename);
  return download.href;
}
