import {load} from 'cheerio';
import ts from 'typescript';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';
import {certificateBrowserHeading,certificateBrowserIcon,certificateBrowserProfile,validateProtectedConversationBrowserResources} from './vercel-preview-browser-transport.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';
import {certificateAwardPath} from '../../server/certificateAwardsContract.js';

const assetLimit=256, fileLimit=4_000_000, totalLimit=24_000_000;
const generated=/^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/u;
const publicMedia=/^\/(?:assets|dtm-theme|school-assets|stu-reference)\/[a-zA-Z0-9._/-]+\.(?:woff2?|ttf|png|jpe?g|webp|gif|svg|avif)$/iu;
const validTypes={
  html:/^text\/html(?:\s*;|$)/iu,
  js:/^(?:application|text)\/(?:java|ecma)script(?:\s*;|$)/iu,
  css:/^text\/css(?:\s*;|$)/iu,
};
// Select only the lazy entry for the fixed page and its assistant/auth dependencies.
const browserAssetsProfiles=new Map([
  ['dtm',{shell:'/dtm',requiredEdges:['index:PublicSite','PublicSite:DigitalMaterials'],
    extraEdges:['DigitalMaterials:authClient','useAffairsRecords:authClient','researchAssistant:supabase'],
    homeMedia:['/dtm-theme/page.svg','/dtm-theme/url.svg','/dtm-theme/user-small.png']}],
  [certificateBrowserProfile,{shell:certificateAwardPath,requiredEdges:['index:PublicSite','PublicSite:SchoolAffairsEntry'],
    extraEdges:['useAffairsRecords:authClient','researchAssistant:supabase'],homeMedia:[certificateBrowserHeading]}],
]);
class AssetDiscoveryError extends Error{
  constructor(reason){super('Protected browser assets: '+reason+'.');}
}
const check=(condition,reason)=>{if(!condition)throw new AssetDiscoveryError(reason);};

function absoluteAssetPath(reference,file,origin){
  check(typeof reference==='string'&&reference.length<=256
    &&/^(?:\/(?!\/)|\.\/|assets\/)[a-zA-Z0-9._/-]+$/u.test(reference)
    &&!reference.split('/').some(segment=>segment==='..'),'invalid dependency path');
  const absolute=reference.startsWith('assets/')?'/'+reference:reference;
  const parsed=new URL(absolute,origin+file);
  check(parsed.origin===origin&&!parsed.search&&!parsed.hash&&!parsed.username&&!parsed.password,'invalid dependency origin');
  return parsed.pathname;
}

function stem(file){
  return /\/([a-zA-Z0-9_.-]+)-[a-zA-Z0-9_-]{8}\.js$/u.exec(file)?.[1];
}

function moduleList(html){
  const $=load(html);
  const entry=$('script[type="module"][src]').toArray();
  check(entry.length===1&&$('#root').length===1&&$('[data-stu-boot]').length>0&&!$('base').length,'invalid application shell');
  return {modules:[$(entry[0]).attr('src'),...$('link[rel~="modulepreload"],link[rel~="stylesheet"]').toArray().map(tag=>$(tag).attr('href'))],
    icons:$('link[rel="icon"]').toArray().map(tag=>$(tag).attr('href'))};
}

function preloadIndices(node,tree){
  // Bind the indices to the nearest emitted preload call containing this import.
  for(let parent=node.parent;parent&&parent!==tree;parent=parent.parent){
    if(!ts.isCallExpression(parent))continue;
    const call=parent.arguments.find(argument=>ts.isCallExpression(argument)&&ts.isIdentifier(argument.expression)
      &&argument.expression.text==='__vite__mapDeps');
    if(!call)continue;
    const list=call.arguments[0];
    check(call.arguments.length===1&&ts.isArrayLiteralExpression(list)
      &&list.elements.length>0&&list.elements.length<=assetLimit&&list.elements.every(ts.isNumericLiteral),'invalid preload index');
    return list.elements.map(item=>Number(item.text));
  }
  check(false,'missing selected preload');
}

function preloadMap(tree){
  const maps=tree.statements.flatMap(statement=>ts.isVariableStatement(statement)
    ?statement.declarationList.declarations.filter(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text==='__vite__mapDeps'):[]);
  check(maps.length===1&&maps[0].initializer,'missing preload map');
  const tables=[];
  const inspect=node=>{
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken
      &&ts.isPropertyAccessExpression(node.left)&&node.left.name.text==='f'&&ts.isArrayLiteralExpression(node.right))
      tables.push(node.right.elements);
    ts.forEachChild(node,inspect);
  };
  inspect(maps[0].initializer);
  check(tables.length===1&&tables[0].length<=assetLimit&&tables[0].every(ts.isStringLiteralLike),'invalid preload map');
  return tables[0].map(item=>item.text);
}

function javascriptAssets(source,file,origin,add,seenEdges,lazyEdges){
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
  check(tree.parseDiagnostics.length===0,'invalid compiled JavaScript');
  let map;
  const visit=node=>{
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
      check(ts.isStringLiteralLike(node.moduleSpecifier),'invalid static import');
      add(absoluteAssetPath(node.moduleSpecifier.text,file,origin));
    }
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
      const child=node.arguments[0];
      if(child&&ts.isStringLiteralLike(child)){
        const name=stem(child.text);
        const edge=stem(file)+':'+name;
        if(lazyEdges.has(edge)){
          const dependency=absoluteAssetPath(child.text,file,origin);
          check(generated.test(dependency)&&dependency.endsWith('.js'),'invalid selected lazy import');
          add(dependency);
          map??=preloadMap(tree);
          for(const index of preloadIndices(node,tree)){
            check(Number.isSafeInteger(index)&&index>=0&&index<map.length,'invalid preload index');
            add(absoluteAssetPath(map[index],file,origin));
          }
          seenEdges.add(edge);
        }
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(tree);
}

function stylesheetAssets(source,file,origin,add,addMedia){
  const css=source.replace(/\/\*[\s\S]*?\*\//gu,'');
  const imports=/@import\s+(?:url\(\s*)?(['"]?)([^'"()\s;]+)\1\s*\)?/giu;
  for(const match of css.matchAll(imports))add(absoluteAssetPath(match[2],file,origin));
  for(const match of css.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/giu)){
    if(!/^(?:\/(?!\/)|\.\/|assets\/)/u.test(match[2]))continue;
    const name=absoluteAssetPath(match[2],file,origin);
    if(publicMedia.test(name))addMedia(name);
  }
}

async function bounded(work,signal){
  signal.throwIfAborted();
  let abort;
  const expired=new Promise((_,reject)=>{
    abort=()=>reject(new AssetDiscoveryError('request deadline'));
    signal.addEventListener('abort',abort,{once:true});
  });
  try{return await Promise.race([work(),expired]);}
  finally{signal.removeEventListener('abort',abort);}
}

async function textResource(fetchImpl,origin,path,type,signal,charge){
  const url=origin+path;
  const active=AbortSignal.any([signal,AbortSignal.timeout(8000)]);
  try{
    return await bounded(async()=>{
      const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:active});
      let reader;
      try{
        check(response.status===200&&!response.redirected&&(!response.url||response.url===url)
          &&validTypes[type].test(response.headers.get('content-type')||''),'unexpected resource response');
        reader=response.body?.getReader();
        check(reader,'missing resource body');
        const pieces=[];
        let size=0;
        for(;;){
          active.throwIfAborted();
          const {value,done}=await reader.read();
          if(done)break;
          size+=value.byteLength;
          check(size<=fileLimit&&pieces.length<4096,'resource byte limit');
          charge(value.byteLength);
          pieces.push(value);
        }
        return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(pieces));
      }finally{
        if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
        else if(response?.body)void response.body.cancel().catch(()=>{});
      }
    },active);
  }catch(error){
    if(error instanceof AssetDiscoveryError)throw error;
    throw new AssetDiscoveryError('resource could not be read');
  }
}

/** Discover paths from the actual pinned build. This module reads no credentials
 * and has no default network, file-write, browser, or fixture behavior. */
export async function deriveProtectedConversationBrowserAssets({origin,approvedPreviewOrigin,revision,fetchImpl,signal,profile='dtm'}={}){
  check(isEvaluationPreviewOrigin(origin)&&approvedPreviewOrigin===origin&&typeof fetchImpl==='function'
    &&(signal===undefined||signal instanceof AbortSignal),'invalid discovery target');
  const settings=browserAssetsProfiles.get(profile);
  check(settings,'invalid discovery target');
  const {shell,requiredEdges,extraEdges,homeMedia}=settings,lazyEdges=new Set([...requiredEdges,...extraEdges]);
  const budget=AbortSignal.timeout(45_000);
  const active=signal?AbortSignal.any([signal,budget]):budget;
  const pin=createPinnedDeploymentVerifier({origin,approvedPreviewOrigin,expectedRevision:revision,fetchImpl,signal:active});
  await pin.pin();
  let bytes=0;
  const charge=count=>{bytes+=count;check(bytes<=totalLimit,'total byte limit');};
  const assets=new Set(homeMedia),seenEdges=new Set(),pending=[];
  function record(path){
    assets.add(path);check(assets.size<=assetLimit,'asset count limit');return path;
  }
  function add(path){
    check(generated.test(path),'non-generated executable dependency');
    if(!assets.has(path))pending.push(record(path));
  }
  const html=await textResource(fetchImpl,origin,shell,'html',active,charge);
  const {modules,icons}=moduleList(html);
  if(profile===certificateBrowserProfile&&icons.includes(certificateBrowserIcon))record(certificateBrowserIcon);
  const [entry,...links]=modules.map(reference=>absoluteAssetPath(reference,shell,origin));
  check(stem(entry)==='index','invalid shell entry');
  add(entry);
  links.forEach(add);
  for(let index=0;index<pending.length;index++){
    const file=pending[index],type=file.endsWith('.js')?'js':'css';
    const source=await textResource(fetchImpl,origin,file,type,active,charge);
    if(type==='js')javascriptAssets(source,file,origin,add,seenEdges,lazyEdges);
    else stylesheetAssets(source,file,origin,add,record);
  }
  check(requiredEdges.every(edge=>seenEdges.has(edge)),profile==='dtm'?'missing required DTM route':'missing required certificate route');
  validateProtectedConversationBrowserResources({origin,assets:[...assets],profile});
  await pin.finish();
  return {revision,assets:[...assets].sort()};
}
