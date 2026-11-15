const base = '/dtm/course/c0100000-0000-4000-8000-000000000010';
const detail = base+'/material/c0100000-0000-4000-8000-000000000020';
const list = base+'/materials';
const worksheet = 'Circuit worksheet';

export const dtmMaterialCasePrefix = 'account:dtm-native-material-';
export function buildDtmMaterialCases() {
  const bank = [
    {id:'detail',question:'What is this material about and where is its link?',texts:[worksheet,'Three practice diagrams.','saved link is available']},
    {id:'overview',route:base,question:'List the saved teaching materials for this course.',texts:[worksheet],link:list,links:[detail]},
    {id:'list-zh',route:list,question:'這門課有哪些已儲存教材？',texts:[worksheet],links:[detail]},
    {id:'no-link',question:'Where is this material’s link?',texts:[worksheet,'no saved destination link']},
    {id:'not-file-content',question:'What are the contents of this file?',texts:[worksheet,'haven’t opened or downloaded']},
    {id:'exclude-summary',question:'Show this file, but do not include the summary.',texts:[worksheet],deny:['Three practice diagrams.']},
    {id:'foreign-en',question:'Show the saved course materials for Alice.',boundary:'denial',texts:['your own account']},
    {id:'foreign-zh',question:'顯示王小明的教材。',boundary:'denial',texts:['我只能查詢你帳戶中']},
    {id:'write-boundary',question:'Replace this Moodle material.',boundary:'clarify',texts:['manage saved materials'],link:detail},
    {id:'missing',question:'What is this material?',texts:['no saved resource at this exact']},
    {id:'unavailable',question:'Show this material.',texts:['could not verify'],unavailable:true},
    {id:'list-partial',route:list,question:'List my course materials.',texts:['partial list','Item 12'],deny:['Item 13']},
  ];
  return bank.map(({id,route=detail,question,texts,deny=[],boundary,unavailable,link=boundary||unavailable?null:route,links=[]})=>{
    const reads=boundary?[]:['dtmMaterials'];
    return {id:dtmMaterialCasePrefix+id,domain:'dtmMaterials',route,question,
      language:/\p{Script=Han}/u.test(question)?'zh-Hant':'en',mode:'record',
      fixtureKey:'offline:dtm-material:'+id,fixtureRequirement:'offline_dtm_native_fixture',coveredTools:reads,
      expected:{behavior:boundary??(unavailable?'unavailable':'answer'),requiredText:texts,
        ...(unavailable?{limitation:true,verification:'unverified'}:boundary?{}:{
          verification:'verified',exactLists:[{expected:[texts.includes(worksheet)?worksheet:texts.at(-1)],forbidden:deny}],
        }),
        allowedTools:reads,requiredTools:unavailable?[]:reads,requiredAttemptedTools:reads,noAction:true,forbidPublicResearch:true,
        requiredLinks:[...(link?[link]:[]),...links],forbiddenText:[...deny,'hidden-destination','FOREIGN_ITEM'],
        requiredSourceBindings:link&&!boundary?[{sourceId:'account:dtmMaterials',url:link}]:[],localLinksOnly:true}};
  });
}
