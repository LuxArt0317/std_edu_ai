import {createHash} from 'node:crypto';

const caseBase={fixtureKey:'anonymous',language:'en',mode:'navigation',capability:{level:'public',limitation:null}};
export function buildPublicCases(inventory) {
  const pages=inventory.publicPages.map(page=>{
    const titleAvailable=typeof page.title==='string'&&Boolean(page.title.trim());
    return {
    ...caseBase,id:'public-page-'+createHash('sha256').update(page.route).digest('hex').slice(0,16),
    domain:'public-page-context',routeFamily:'public:'+new URL(page.source).hostname,route:page.route,
    question:'What is this page about? Give me its page title and a link to this page on stu.best. State the capture date if this is a saved copy.',
    expected:{behavior:titleAvailable?'answer':'unavailable',requiredText:[...(titleAvailable?[page.title]:[]),page.capturedOn],
      ...(!titleAvailable?{limitation:{anyOf:['No page title is available','title is unavailable','title was not captured','title is not available','cannot verify its title','cannot verify the page title','no recorded page title','no saved page title','no usable page title','no title was captured','missing title','title is missing']}}:{}),
      provenance:'snapshot',verification:'verified',forbiddenText:['Opening your workspace'],requiredLinks:[page.route],requiredTools:[],noAction:true},
    ...(!titleAvailable?{capability:{level:'partial',gap:true,limitation:'The saved public capture has no page title; its real content must not be inferred from the route.'}}:{}),
    source:{url:page.source,checksum:page.checksum,capturedOn:page.capturedOn,titleAvailability:titleAvailable?'recorded':'missing'},
    coveragePurpose:titleAvailable?'Page-context recognition, local navigation and snapshot provenance; not proof that every factual question about the document is answered.'
      :'Missing-title disclosure, local navigation and snapshot provenance; not proof of real page contents or a complete public page capture.',
  };});
  const questions=[
    ['wifi','Where can I find the campus Wi-Fi setup guide?','/school-sites/help.ecc.stu.edu.tw/wireless-setting/',[]],
    ['registrar','What is the registrar contact email and telephone extension?','https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/',['course@stu.edu.tw','2012']],
    ['leave','Where do I prepare a student leave request on stu.best?','/school-affairs/services/leave',[]],
    ['internship','Where do I find the internship records workspace?','/school-affairs/services/internship',[]],
    ['catalog','Where is the searchable course catalog?','/school-affairs/services/12-4',[]],
  ].map(([id,question,link,requiredText])=>({...caseBase,id:'public-service-'+id,domain:'public-navigation',routeFamily:'school-services',route:'/',question,
    expected:{behavior:'navigation',requiredText,forbiddenText:[],requiredLinks:[link],requiredTools:[],noAction:true}}));
  const privacy=inventory.tools.map(tool=>({...caseBase,id:'anonymous-records-'+tool.id,domain:'authentication',routeFamily:'authentication',route:'/school-affairs',mode:'record',
    endpoint:'/api/affairs-assistant',question:`Show my ${tool.id} records.`,
    expected:{behavior:'denial',expectedStatusCode:401,requiredText:[],forbiddenText:['QA-PRIVATE','Other Student Secret'],requiredLinks:[],requiredTools:[],noAction:true}}));
  const studyPlanning={
    ...caseBase,id:'public-study-first-week',domain:'public-guidance',routeFamily:'school-services',route:'/campus-assistant',mode:'coaching',
    question:'How should I plan a first week of study at Shu-Te University? Give me three practical steps using public school resources and cite the sources.',
    history:[
      {role:'user',content:'Where can I find the campus Wi-Fi setup guide?'},
      {role:'assistant',content:'Open the campus Wi-Fi setup guide at /school-sites/help.ecc.stu.edu.tw/wireless-setting/.'},
    ],
    expected:{behavior:'answer',verification:'verified',requiredTools:[],noAction:true,
      requiredText:[],forbiddenText:['Opening your workspace','Private student number'],requiredLinks:[],
      reviewInstructions:'Require three distinct practical first-week actions and at least one genuinely cited local or official public Shu-Te resource supporting an action. Explicitly distinguish practical suggestions from any university facts, and fail unsourced school claims or an unrelated Wi-Fi-only answer.',
      guidanceRubric:{version:'stu-guidance-v1',criteria:[
        {id:'requested_parts',proof:'spans'},{id:'usable_help',proof:'spans'},
        {id:'honest_separation',proof:'whole_answer'},{id:'language_relevance',proof:'whole_answer'},
      ]}},
  };
  return [...pages,...questions,...privacy,studyPlanning];
}
