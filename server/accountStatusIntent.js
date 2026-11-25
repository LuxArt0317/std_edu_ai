const controls=/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;

export function accountStatusIntent(question,route=''){
  if(typeof question!=='string'||question.length>200||controls.test(question))return null;
  const text=question.normalize('NFKC').trim().replace(/[?.!。！？]+$/u,'');
  if(/^(?:do you (?:know|recognize|recognise|remember) me|who am i|你(?:知道|認識|认识|記得|记得)我是誰(?:嗎)?|你(?:認識|认识|記得|记得)我(?:嗎)?)$/iu.test(text))return 'identity';
  if(/^(?:(?:what|which) (?:google account|(?:email|e-mail)(?: address)?) (?:am i signed in with|did i (?:use to )?(?:sign|log) in with)|who am i signed in as|(?:我(?:目前)?(?:是)?用)?哪(?:一)?個\s*(?:Google\s*)?帳(?:號|戶)(?:登入|登錄)(?:的)?|我(?:目前)?(?:是)?用哪個電子郵件登入(?:的)?)$/iu.test(text))return 'email';
  if(/^(?:am i (?:currently )?(?:signed|logged) in(?: (?:to|on) (?:stu\.best|school affairs|dtm))?|(?:我(?:目前)?(?:有|已經)?登入)(?:了)?嗎)$/iu.test(text))return 'state';
  if(/^(?:(?:what is|what['’]s) my (?:saved )?display name|(?:please )?show (?:me )?my (?:saved )?display name|我的(?:帳戶)?顯示名稱是(?:什麼|甚麼)|(?:請)?(?:顯示|查看|查詢)我的(?:帳戶)?顯示名稱)$/iu.test(text))return 'displayName';
  if(route==='/account-status'&&/^(?:what is my (?:email|e-mail)(?: address)?|我的電子郵件(?:地址)?是什麼)$/iu.test(text))return 'email';
  return null;
}
