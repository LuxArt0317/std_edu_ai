import {generateApplicationApis} from '../server/applicationApiCatalogBuild.js';
const routes=await generateApplicationApis(process.cwd());
console.log(JSON.stringify({applicationApisCompiled:true,routes:routes.length,callable:routes.filter(r=>!r.disabledReason).length}));
