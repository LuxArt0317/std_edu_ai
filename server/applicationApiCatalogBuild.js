import ts from 'typescript';
import {readFile,readdir,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
const verbs=['GET','POST','PUT','PATCH','DELETE'];
function literal(node){
 if(ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isParenthesizedExpression(node))return literal(node.expression);
 if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
 if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
 if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(node.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isNumericLiteral(node))return Number(node.text);
 if(ts.isArrayLiteralExpression(node))return node.elements.map(literal);
 if(ts.isCallExpression(node)&&node.expression.getText()==='Object.freeze'&&node.arguments.length===1)return literal(node.arguments[0]);
 if(ts.isObjectLiteralExpression(node)){const out={};for(const p of node.properties){if(!ts.isPropertyAssignment(p)||!p.name||!('text' in p.name)||['__proto__','constructor','prototype'].includes(p.name.text))throw Error('API metadata must use literal properties.');out[p.name.text]=literal(p.initializer);}return out;}
 throw Error('API metadata must be a static JSON literal.');
}
export async function inventoryApplicationApis(root){
 const entries=await readdir(resolve(root,'api'),{withFileTypes:true});
 if(entries.some(e=>e.isDirectory()))throw Error('Nested API routes require catalog support; do not silently omit handlers.');
 const files=entries.filter(e=>e.isFile()&&e.name.endsWith('.ts')&&!e.name.endsWith('.d.ts')).map(e=>e.name).sort();
 if(files.some(f=>!/^[a-z][a-z0-9-]*\.ts$/u.test(f)))throw Error('API route filenames must follow the lowercase-hyphen naming convention.');const routes=[];
 for(const file of files){
  const source=await readFile(resolve(root,'api',file),'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let metadata;
  for(const statement of tree.statements)if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.name.text==='assistantApi')metadata=literal(d.initializer);
  if(metadata!==undefined&&(!metadata||typeof metadata!=='object'||Array.isArray(metadata)))throw Error(file+': invalid assistantApi metadata');
  const slug=basename(file,'.ts'),description=metadata?.description||`Application API ${slug}. Inspect the schema and returned validation errors; do not invent fields.`;
  if(typeof description!=='string'||description.length>1500)throw Error(file+': invalid description');
  const methods=metadata?.methods??verbs,reads=metadata?.readMethods??[];
  if(!Array.isArray(methods)||!methods.length||methods.some(v=>!verbs.includes(v))||new Set(methods).size!==methods.length||!Array.isArray(reads)||reads.some(v=>!methods.includes(v)))throw Error(file+': invalid methods');
  const recursive=/(?:^|-)assistant$|^assistant-api-tools$/u.test(slug);
  const disabled=recursive?'Assistant and tool-control endpoints cannot call themselves recursively.':metadata?.disabledReason??null;
  if(disabled!==null&&typeof disabled!=='string')throw Error(file+': invalid disabled reason');
  const scopeHints=new Set(),queryFields=new Set(),kindHints=new Set();
  function hints(node){
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(tree)==='scopes'&&node.expression.name.text==='includes'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))scopeHints.add(node.arguments[0].text);
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isStringLiteral(node.right)){
    if(ts.isIdentifier(node.left)&&node.left.text==='scope')scopeHints.add(node.right.text);
    if(ts.isPropertyAccessExpression(node.left)&&node.left.name.text==='kind')kindHints.add(node.right.text);
   }
   ts.forEachChild(node,hints);
  }hints(tree);
  for(const m of source.matchAll(/query\?*\.([a-zA-Z_][a-zA-Z0-9_]*)/gu))queryFields.add(m[1]);
  // Imported scope constants are hints only; endpoint validators remain authoritative.
  for(const statement of tree.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&statement.moduleSpecifier.text.startsWith('../')&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings)){
   const bindings=statement.importClause.namedBindings.elements.filter(e=>/(?:Scope|Actions?|Kinds?|Change|Save|Submit|Review)$/u.test(e.name.text));if(!bindings.length)continue;
   let imported;try{imported=await readFile(resolve(root,'api',statement.moduleSpecifier.text),'utf8');}catch{continue;}
   const parsed=ts.createSourceFile('contract.js',imported,ts.ScriptTarget.Latest,true);
   for(const item of parsed.statements)if(ts.isVariableStatement(item))for(const d of item.declarationList.declarations)if(ts.isIdentifier(d.name)&&bindings.some(e=>(e.propertyName?.text??e.name.text)===d.name.text)&&d.initializer){try{const value=literal(d.initializer);if(/Scope$/u.test(d.name.text)){if(typeof value==='string')scopeHints.add(value);}else if(typeof value==='string')kindHints.add(value);else if(Array.isArray(value)){for(const item of value)if(typeof item==='string')kindHints.add(item);}else if(value&&typeof value==='object'){for(const key of Object.keys(value))kindHints.add(key);}}catch{/* Nonliteral contracts are intentionally not guessed. */}}
  }
  routes.push({slug,path:'/api/'+slug,description,methods,readMethods:reads,disabledReason:disabled,sourceHash:createHash('sha256').update(source).digest('hex'),queryFields:[...queryFields].sort(),scopeHints:[...scopeHints].sort(),kindHints:[...kindHints].sort(),querySchema:metadata?.querySchema??{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'array',items:{type:'string'}}]}},bodySchema:metadata?.bodySchema??{type:'object',...(kindHints.size?{properties:{kind:{type:'string',enum:[...kindHints].sort()},payload:{type:'object',additionalProperties:true}}}:{}),additionalProperties:true}});
 }
 try{
  const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
  for(const rewrite of config.rewrites??[]){
   if(typeof rewrite.source!=='string'||!/^\/api\/[a-z][a-z0-9-]*$/u.test(rewrite.source)||typeof rewrite.destination!=='string'||!rewrite.destination.startsWith('/api/'))continue;
   if(routes.some(row=>row.path===rewrite.source))continue;
   const target=new URL(rewrite.destination,'https://application.invalid'),backing=routes.find(row=>row.path===target.pathname);if(!backing)throw Error('API rewrite has no discoverable backing handler: '+rewrite.source);
   const fixedQuery=Object.fromEntries(target.searchParams),slug=rewrite.source.slice(5),control=slug==='assistant-api-tools';
   routes.push({...backing,slug,path:rewrite.source,aliasOf:backing.slug,fixedQuery,methods:verbs,description:control?'API tool discovery and reviewed-action control plane.':`API alias for ${backing.path} with fixed selectors ${JSON.stringify(fixedQuery)}. Existing handler permissions and validation apply.`,disabledReason:control?'Tool-control endpoints cannot be invoked recursively.':backing.disabledReason,sourceHash:createHash('sha256').update(backing.sourceHash+rewrite.source+JSON.stringify(fixedQuery)).digest('hex')});
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 return routes;
}
export async function generateApplicationApis(root){
 const catalog=await inventoryApplicationApis(root);await mkdir(resolve(root,'server'),{recursive:true});
 for(const route of catalog.filter(route=>!route.aliasOf)){const source=await readFile(resolve(root,'api',route.slug+'.ts'),'utf8');
  for(const statement of ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true).statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&(statement.moduleSpecifier.text.startsWith('./')||/\.tsx?$/u.test(statement.moduleSpecifier.text)))throw Error(route.slug+': runtime imports must use parent-relative JavaScript paths.');
  const output=ts.transpileModule(source,{fileName:route.slug+'.ts',compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext},reportDiagnostics:true});if(output.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('API compile failed: '+route.slug);
  const path=resolve(root,'server',`applicationApiRuntime-${route.slug}.js`);await writeFile(path+'.tmp',`// Generated; source-sha256: ${route.sourceHash}\n${output.outputText}`);await rename(path+'.tmp',path);
 }
 for(const file of await readdir(resolve(root,'server')))if(/^applicationApiRuntime-.*\.js$/u.test(file)&&!catalog.some(r=>!r.aliasOf&&file===`applicationApiRuntime-${r.slug}.js`)){const path=resolve(root,'server',file);if(!(await readFile(path,'utf8')).startsWith('// Generated;'))throw Error('Refusing to remove a non-generated API module.');await unlink(path);}
 const loaders=catalog.map(r=>`${JSON.stringify(r.slug)}:()=>import(${JSON.stringify('./applicationApiRuntime-'+(r.aliasOf??r.slug)+'.js')})`).join(',\n');
 const output=`// Generated from every api/*.ts handler. Do not edit.\nexport const applicationApiCatalog=${JSON.stringify(catalog,null,2)};\nconst loaders={${loaders}};\nexport async function loadApplicationApiHandler(slug){if(!Object.hasOwn(loaders,slug))throw Error('Unknown API');return (await loaders[slug]()).default;}\n`;
 const path=resolve(root,'server/applicationApiCatalog.generated.js');await writeFile(path+'.tmp',output);await rename(path+'.tmp',path);return catalog;
}
