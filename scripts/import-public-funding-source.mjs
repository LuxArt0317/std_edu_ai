/** Project checksum-verified public funding pages/PDFs, never lab references. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {extractPdfSections} from '../server/knowledgeAcquisition.js';
const pages=JSON.parse(await fs.readFile('src/features/public/mirror/pages.json','utf8'));
const assets=JSON.parse(await fs.readFile('src/features/public/mirror/assets.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pageFiles=[
 ['moe-remission','1bfe2837cec317da3281'],['tuition-gap-index','4014b317a03ba9eae06d'],
 ['tuition-gap-optout','60b62c9ed21c6a7d18fc'],['disadvantaged-aid','193e5893df95cea702e6'],
 ['scholarship-index','59ec48093cbd18f31c15'],['international-internal','87e7e4a31807aed9c0c7'],
 ['international-external','4429296f9d5081b83477'],
];
const documents=[];
for(const [role,key]of pageFiles){
 const page=pages.find(row=>row.file===`/school-pages/${key}.html`);
 if(!page)throw Error('Funding page is not registered: '+key);
 const bytes=await fs.readFile('public'+page.file);if(hash(bytes)!==page.checksum)throw Error('Funding page checksum mismatch: '+key);
 const $=load(bytes.toString('utf8')),body=$('.entry-content').first().length?$('.entry-content').first():$('[data-elementor-type="wp-page"]').first();
 if(!body.length)throw Error('Funding source body unavailable: '+key);
 body.find('script,style,nav,form,iframe').remove();
 const headings=body.find('h1,h2,h3,h4').map((_,element)=>$(element).text().replace(/\s+/gu,' ').trim()).toArray().filter(Boolean);
 const scopeConstraints=body.find('h5').map((_,element)=>$(element).text().replace(/\s+/gu,' ').trim()).toArray().filter(text=>/專班不適用|學年度.*入學|入學者/u.test(text));
 const destinations=body.find('a[href]').map((_,element)=>{const node=$(element),url=node.attr('href')||'',label=node.text().replace(/\s+/gu,' ').trim();
  const known=pages.some(row=>row.route===url)||assets.some(row=>row.file===url);
  return label?{label,...(known?{url}:{destinationAvailable:false})}:null;
 }).toArray();
 body.find('br').replaceWith('\n');body.find('p,h1,h2,h3,h4,h5,h6,li').append('\n');
 const text=body.text().replace(/[\t ]+/gu,' ').replace(/\n\s*\n/gu,'\n').trim();
 if(!text)throw Error('Funding source has no article text: '+key);
 documents.push({role,title:page.title,url:page.route,source:page.source,capturedOn:page.capturedOn,checksum:page.checksum,
  coverage:'Published article text only. A linked title is navigation, not proof of the linked document contents. Dates and entry-cohort restrictions remain part of the source; this is not a personal award or deduction.',sections:[{locator:'html:article',text}],headings,scopeConstraints,destinations});
}
for(const [role,file,selectedPages,title,scope]of [
 ['tuition-gap-rules','/school-assets/0ed1f826a1a543505d9b.pdf',[1],'行政院減免學雜費(拉近方案) 減免資格及原則','Source URL identifies114-2; do not present as a later term\'s current application notice.'],
 ['moe-categories','/school-assets/6f224d05e7ba05d64250.pdf',[3],'樹德科技大學學雜費減免申辦流程 · 減免類別','Only the published category list on PDF page3 is selected, not an authenticated application or current deadline.'],
]){
 const asset=assets.find(row=>row.file===file);if(!asset)throw Error('Funding PDF is not registered: '+file);
 const bytes=await fs.readFile('public'+file);if(hash(bytes)!==asset.checksum)throw Error('Funding PDF checksum mismatch: '+file);
 const parsed=await extractPdfSections(bytes),sections=parsed.sections.filter(section=>selectedPages.includes(Number(section.sourceLocator.split(':').at(-1)))).map(section=>({locator:section.sourceLocator,text:section.content}));
 if(sections.length!==selectedPages.length)throw Error('Selected funding PDF page missing: '+file);
 documents.push({role,title,url:file,source:asset.source,capturedOn:documents.find(document=>document.role==='moe-remission').capturedOn,checksum:asset.checksum,coverage:scope,pageCount:parsed.pageCount,sections,destinations:[]});
}
const data={version:1,documents};await fs.writeFile('server/data/publicFundingSources.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({documents:documents.length,checksumsVerified:true}));
