// Synthetic provider responses test the local UI only. They do not prove live OAuth.
export const affairsTestUser = {
  id:'b5f9f9fb-87cd-4183-a734-c00dac147af1',aud:'authenticated',role:'authenticated',email:'student.qa@gmail.com',
  app_metadata:{provider:'google',providers:['google'],role:'student'},user_metadata:{name:'QA Student'},
  identities:[{provider:'google',id:'google-qa',user_id:'b5f9f9fb-87cd-4183-a734-c00dac147af1',identity_data:{email_verified:true}}],
  created_at:'2026-11-03T00:00:00Z',email_confirmed_at:'2026-11-03T00:00:00Z',
};
export const affairsTestSession = (user=affairsTestUser) => ({
  access_token: [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'qa-only-signature'].join('.'),
  refresh_token:'qa-only-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user,
});
export async function mockAffairsAuth(context,{signedIn=true,user=affairsTestUser}={}) {
  const session=affairsTestSession(user);
  const calls=[];
  await context.addInitScript(({signedIn,session})=>{
    if (window.top !== window || !['http:','https:'].includes(window.location.protocol)) return;
    if(signedIn && !localStorage.getItem('qa-affairs-seeded')) {
      localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
      localStorage.setItem('qa-affairs-seeded','1');
    }
    localStorage.setItem('stu-affairs-preview-v1',String(Date.now()+1800000));
  },{signedIn,session});
  await context.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());calls.push({pathname:url.pathname,search:url.search,body:route.request().postData()});
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
    if(url.pathname==='/auth/v1/settings')return route.fulfill({json:{external:{google:true}}});
    if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
    if(url.pathname==='/auth/v1/token')return route.fulfill({json:session});
    if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
    return route.abort();
  });
  return calls;
}
