/** Project source bytes, not expected answers, into queryable public evidence. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const assets=JSON.parse(await fs.readFile('src/features/public/mirror/assets.json','utf8'));
const asset=assets.find(row=>row.file==='/school-assets/ae47f1b002b79a4e65d6.pdf');
if(!asset)throw Error('Accounting source is not registered');
const buffer=await fs.readFile('public'+asset.file);
if(createHash('sha256').update(buffer).digest('hex')!==asset.checksum)throw Error('Accounting PDF checksum mismatch');
const parsed=await extractPdfSections(buffer);
if(!parsed.sections.length)throw Error('Accounting PDF has no readable pages');
const value={title:'115 academic-year Accounting tuition and fee standards',source:asset.source,url:asset.file,capturedOn:'2026-11-03',checksum:asset.checksum,pageCount:parsed.pageCount,scope:'Published 115 academic-year fee table; rates depend on study level, program and department exceptions. Not a personal invoice, payment or award.',pages:parsed.sections.map(section=>({locator:section.sourceLocator,text:section.content}))};
await fs.writeFile('server/data/accounting115Fees.json',JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({pages:parsed.pageCount,checksum:asset.checksum}));
