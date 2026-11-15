const prefix='account:account-identity-';
const requirement='offline_verified_account_identity';
const path='/account-status';
const tool='accountIdentity';
export const accountStatusOwners={
  first:{id:'3bad0000-0000-4000-8000-000000000001',email:'owned.indicator+one@school.example'},
  second:{id:'3bad0000-0000-4000-8000-000000000002',email:'separate.indicator@school.example'},
};
const privateMarkers=['AUTH_CREDENTIAL','NEXUS_PROFILE_ONLY','UNRELATED_STUDENT_ID','FALLBACK_PROVIDER_EMAIL'];

export function accountStatusCases(){
  const vectors=[
    {id:'email-en',question:'Which Google account am I signed in with?',identity:'first',required:['Your sign-in email is',accountStatusOwners.first.email],
      facts:[{kind:'text',label:'sign-in email',values:[accountStatusOwners.first.email]}],forbidden:[accountStatusOwners.second.email]},
    {id:'email-zh',question:'我目前是用哪個 Google 帳號登入的？',identity:'second',required:['登入電子郵件為',accountStatusOwners.second.email],
      facts:[{kind:'text',label:'登入電子郵件',values:[accountStatusOwners.second.email]}],forbidden:[accountStatusOwners.first.email]},
    {id:'session-state-only',question:'Am I signed in?',identity:'first',required:['signed in to stu.best through Google'],
      facts:[{kind:'text',label:'signed in',values:['stu.best','Google']}],forbidden:Object.values(accountStatusOwners).map(row=>row.email)},
    {id:'missing-email',question:'What is my email address?',identity:'missing',required:['No email address was returned with this sign-in.'],
      facts:[{kind:'text',label:'email address',values:['No email address was returned with this sign-in']}],forbidden:Object.values(accountStatusOwners).map(row=>row.email)},
    {id:'home',route:'/',question:'Who am I signed in as?',identity:'first',required:[accountStatusOwners.first.email],
      facts:[{kind:'text',label:'sign-in email',values:[accountStatusOwners.first.email]}],forbidden:[accountStatusOwners.second.email]},
    {id:'guest',question:'What is my email address?',identity:'guest',required:['no verified School Affairs session','Sign in to School Affairs with Google'],
      forbidden:Object.values(accountStatusOwners).map(row=>row.email)},
    {id:'expired',question:'Which Google account am I signed in with?',identity:'expired',required:[],
      forbidden:Object.values(accountStatusOwners).map(row=>row.email)},
  ];
  return vectors.map(row=>{
    const signedIn=!['guest','expired'].includes(row.identity);
    const tools=signedIn?[tool]:[];
    return {id:prefix+row.id,domain:tool,route:row.route??path,question:row.question,mode:signedIn?'record':'boundary',
      language:row.id.endsWith('-zh')?'zh-Hant':'en',endpoint:row.identity==='guest'?'/api/research-assistant':'/api/affairs-assistant',
      fixtureKey:'offline:account-identity:'+row.identity,fixtureRequirement:requirement,coveredTools:tools,identityFixture:row.identity,
      expected:{behavior:signedIn?'answer':'denial',requiredText:row.required,
        ...(signedIn?{facts:row.facts,verification:'verified',
          requiredSourceBindings:[{sourceId:'account:'+tool,url:'/school-affairs'}]}:{}),
        ...(row.identity==='expired'?{statusCode:401}:{}),
        forbiddenText:[...row.forbidden,...privateMarkers,...Object.values(accountStatusOwners).map(item=>item.id)],
        requiredTools:tools,requireToolExecution: true,requiredAttemptedTools:tools,allowedTools:tools,
        requiredLinks:row.identity==='expired'?[]:[signedIn?'/school-affairs':'/school-affairs/login'],
        forbidPublicResearch:true,localLinksOnly:true,noAction:true}};
  });
}

export const accountStatusSetupRequired=row=>row?.fixtureRequirement===requirement
  ||typeof row?.id==='string'&&row.id.startsWith(prefix);
export function assertAccountStatusCaseReady(row){
  if(accountStatusSetupRequired(row))throw new Error('Verified sign-in test fixtures and independent hosted observations are unmounted.');
}
