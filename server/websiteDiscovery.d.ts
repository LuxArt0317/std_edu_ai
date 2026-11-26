import type {verificationModelCall} from './answerVerificationModel.js';
export function searchWebsite(query:string,options?:{deadline?:number;decide?:typeof verificationModelCall;semantic?:boolean;embed?:typeof import('./discoveryEmbeddings.js').embedDiscoveryTexts}):Promise<{strategy:string;results:Array<{id:string;title:string;url:string;capturedOn:string|null;locator:string;excerpt:string;score:number}>;indexedSources:number}>;
export function readWebsitePage(id:string):{id:string;title:string;url:string;content:string;links:Array<{title:string;url:string;indexed:boolean}>};
export function websiteDiscoveryStats():{chunks:number;sources:number;embeddedChunks:number};
