import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

/** Deployment provenance only: never infer a production revision from local Git. */
export function releaseManifest(env=process.env,now=new Date()){
  const hosted=env.VERCEL==='1';
  const revision=hosted&&/^[0-9a-f]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||'')?env.VERCEL_GIT_COMMIT_SHA:null;
  const environment=hosted&&['production','preview','development'].includes(env.VERCEL_ENV)?env.VERCEL_ENV:'local';
  return {version:1,revision,environment,source:revision?'vercel-git':'unverified',builtAt:now.toISOString()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const manifest=releaseManifest();
  await writeFile(new URL('../dist/release.json',import.meta.url),JSON.stringify(manifest)+'\n');
  console.log(JSON.stringify({releaseManifest:true,revision:manifest.revision,environment:manifest.environment}));
}
