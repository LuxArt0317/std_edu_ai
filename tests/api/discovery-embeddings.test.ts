import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeEmbedding,embedDiscoveryTexts,discoveryEmbeddingDimensions} from '../../server/discoveryEmbeddings.js';
test('embedding transport validates dimensions, indexes and finite nonzero vectors',async()=>{
 assert.throws(()=>normalizeEmbedding([1]));assert.throws(()=>normalizeEmbedding(Array(discoveryEmbeddingDimensions).fill(0)));
 const vector=Array(discoveryEmbeddingDimensions).fill(0);vector[0]=2;assert.equal(normalizeEmbedding(vector)[0],1);
 const saved=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const result=await embedDiscoveryTexts(['public text'],{fetcher:async(input,init)=>{assert.equal(input,'https://api.openai.com/v1/embeddings');assert.equal(JSON.parse(String(init?.body)).dimensions,512);return Response.json({data:[{index:0,embedding:vector}]});}});assert.equal(result[0][0],1);
  await assert.rejects(()=>embedDiscoveryTexts(['public'],{fetcher:async()=>Response.json({data:[{index:9,embedding:vector}]})}),/Invalid embedding index/);
  await assert.rejects(()=>embedDiscoveryTexts(['public'],{fetcher:async()=>Response.json({error:'unavailable'},{status:503})}),/HTTP 503/);
 }finally{if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;}
});
