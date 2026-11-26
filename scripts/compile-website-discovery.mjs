import {generateWebsiteDiscovery} from '../server/websiteDiscoveryBuild.js';
console.log(JSON.stringify(await generateWebsiteDiscovery(process.cwd())));

if(process.env.ASSISTANT_EMBEDDINGS_ENABLED==='true')await import('./compile-discovery-embeddings.mjs');
