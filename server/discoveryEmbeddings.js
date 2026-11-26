export const discoveryEmbeddingModel='text-embedding-3-small';
export const discoveryEmbeddingDimensions=512;
export function normalizeEmbedding(value){
 if(!Array.isArray(value)||value.length!==discoveryEmbeddingDimensions||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error('Invalid search embedding.');
 const norm=Math.sqrt(value.reduce((sum,n)=>sum+n*n,0));if(!Number.isFinite(norm)||norm===0)throw Error('Invalid search embedding norm.');return value.map(n=>n/norm);
}
export async function embedDiscoveryTexts(texts,{deadline=Date.now()+25000,fetcher=fetch}={}){
 if(!process.env.OPENAI_API_KEY||!Array.isArray(texts)||!texts.length||texts.length>32||texts.some(text=>typeof text!=='string'||text.length>5000)||deadline<=Date.now())throw Error('Search embeddings unavailable.');
 const response=await fetcher('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:discoveryEmbeddingModel,dimensions:discoveryEmbeddingDimensions,input:texts}),signal:AbortSignal.timeout(Math.max(1,Math.min(25000,deadline-Date.now()))),redirect:'error'});
 if(!response.ok)throw Error('Search embedding provider rejected the request (HTTP '+response.status+').');
 const value=await response.json();if(!Array.isArray(value.data)||value.data.length!==texts.length)throw Error('Incomplete search embeddings.');
 const ordered=Array(texts.length);for(const item of value.data){if(!Number.isInteger(item.index)||item.index<0||item.index>=texts.length||ordered[item.index])throw Error('Invalid embedding index.');ordered[item.index]=normalizeEmbedding(item.embedding);}return ordered;
}
