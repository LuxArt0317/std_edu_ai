import {inventoryApplicationApis} from '../server/applicationApiCatalogBuild.js';
const catalog=await inventoryApplicationApis(process.cwd());
const names=new Set();for(const route of catalog){if(names.has(route.slug))throw Error('Duplicate application API route');names.add(route.slug);if(!route.disabledReason&&route.methods.length===0)throw Error('API has no discoverable methods');}
console.log(JSON.stringify({applicationApiLint:true,routes:catalog.length,recursiveBlocked:catalog.filter(r=>r.disabledReason).length,errors:0}));
