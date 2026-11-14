import {rename,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {openPermanentCourseSource,permanentCourseSource} from '../server/permanentCourseSource.js';

const output = process.argv[2];
if (!output) throw new Error('Pass an output path for the public catalog capture.');
const initial = await openPermanentCourseSource();
const {kinds,divisions} = initial.root;
const pairs = [...new Set(kinds.map(option=>option.value))].flatMap(kind=>divisions.map(({value})=>[kind,value]));
const groups = [];
const captureGroup = async (source,kind,division) => {
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const result = await source.search(kind,division);
      if (result.rows.some(row=>row.kind!==kind)) throw new Error('Source returned another course kind.');
      return result;
    } catch(error) {
      if (attempt===2) throw new Error(`Capture failed for ${kind}/${division}: ${error.message}`);
      await delay((attempt+1)*1200);
    }
  }
};

let cursor = 0;
async function collect(source) {
  while (cursor<pairs.length) {
    const index=cursor++;
    const [kind,division]=pairs[index];
    const list=await captureGroup(source,kind,division);
    groups[index]={kind,division,rows:list.rows.map(({sourceKey:_sourceKey,...row})=>row)};
    await delay(450);
  }
}
await Promise.all([initial,await openPermanentCourseSource(),await openPermanentCourseSource()].map(collect));
const defaults=initial.root.rows.map(({sourceKey:_sourceKey,...row})=>row);
const descriptions=[];
const detailSource=await openPermanentCourseSource();
for (const row of detailSource.root.rows.slice(0,5)) {
  descriptions.push(await detailSource.detail(row,detailSource.root));
  await delay(450);
}
const data={source:permanentCourseSource,capturedAt:new Date().toISOString(),kinds,divisions,groups,defaults,descriptions};
await writeFile(output+'.tmp', JSON.stringify(data)+'\n', {mode:0o600});
await rename(output+'.tmp',output);
console.log(JSON.stringify({groups:groups.length,rows:groups.reduce((count,group)=>count+group.rows.length,0),defaults:defaults.length,descriptions:descriptions.length}));
