export type ReleaseManifest = {
  version: 1;
  revision: string | null;
  environment: 'production' | 'preview' | 'development' | 'local';
  source: 'vercel-git' | 'unverified';
  builtAt: string;
};

export function releaseManifest(
  env?: Record<string, string | undefined>,
  now?: Date,
): ReleaseManifest;
