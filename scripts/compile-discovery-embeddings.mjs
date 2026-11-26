import {readFile,writeFile,rename} from 'node:fs/promises';
import {embedDiscoveryTexts,discoveryEmbeddingModel as model,discoveryEmbeddingDimensions as dimensions} from '../server/discoveryEmbeddings.js';
const index=JSON.parse(await readFile('server/websiteDiscovery.generated.json','utf8'));
let cached={};try{const value=JSON.parse(await readFile('server/websiteDiscovery.embeddings.json','utf8'));if(value.model===model&&value.dimensions===dimensions)cached=value.vectors;}catch{}
const pending=index.documents.filter(row=>!cached[row.id]);let generated=0;
for(let start=0;start<pending.length;start+=24){const batch=pending.slice(start,start+24),vectors=await embedDiscoveryTexts(batch.map(row=>row.title+'\n'+row.content));for(let i=0;i<batch.length;i++)cached[batch[i].id]=vectors[i].map(n=>Math.round(n*1e7)/1e7);generated+=batch.length;const path='server/websiteDiscovery.embeddings.json';await writeFile(path+'.tmp',JSON.stringify({model,dimensions,vectors:Object.fromEntries(index.documents.filter(row=>cached[row.id]).map(row=>[row.id,cached[row.id]]))}));await rename(path+'.tmp',path);console.log(JSON.stringify({embedded:generated,remaining:pending.length-generated}));}
console.log(JSON.stringify({model,dimensions,generated,total:index.documents.length}));
