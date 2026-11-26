export const discoveryEmbeddingModel:string;
export const discoveryEmbeddingDimensions:number;
export function normalizeEmbedding(value:unknown):number[];
export function embedDiscoveryTexts(texts:string[],options?:{deadline?:number;fetcher?:typeof fetch}):Promise<number[][]>;
