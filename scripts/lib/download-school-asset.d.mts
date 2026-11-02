import type { Buffer } from "node:buffer";
export function safeSchoolAssetUrl(value: string): boolean;
export function schoolAssetIdentity(value: string): string;
export function downloadSchoolAsset(
  url: string,
  options?: { timeout?: number; maxBytes?: number },
): Promise<{ buffer: Buffer; type: string }>;
