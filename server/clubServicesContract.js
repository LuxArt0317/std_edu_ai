export const clubPath = '/school-affairs/services/40-1';
export const clubScope = 'student-clubs';
export const clubActions = ['submit_club_equipment', 'edit_club_equipment', 'cancel_club_equipment', 'review_club_equipment'];
export const clubDate = /^\d{4}-\d{2}-\d{2}$/u;
export const clubUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
export const clubMonth = /^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u;
export const clubCategories = {
  lecture:'研習座談',performance:'表演',outreach:'帶動中小學',camp:'營隊',service:'社區服務',
  special:'特色活動',competition:'競賽活動',sports:'體育',other:'其他',uncategorized:'未指定活動類別',
};
export const clubEquipmentCategories = { A01:'擴音設備', B01:'攝影設備', C01:'投影設備', D01:'筆電設備', E01:'其他設備', F01:'會議設備' };
export const clubPurposes = { class:'社課', activity:'活動', meeting:'會議', other:'其他' };
export const clubRequestStatuses = { submitted:'待審核', approved:'已核准', declined:'未核准', cancelled:'已取消', returned:'已歸還' };

const text = value => typeof value === 'string';
const id = value => text(value) && clubUuid.test(value);
const date = value => text(value) && clubDate.test(value);
const instant = value => text(value) && Number.isFinite(Date.parse(value));
const items = value => Array.isArray(value) && value.length <= 10 && value.every(v => v && id(v.id) && text(v.label));
export function validClubWorkspace(value, userId, view) {
  if (value?.userId !== userId || value.view !== view || typeof value.manager !== 'boolean' || !date(value.today) ||
      !Array.isArray(value.rows) || !Array.isArray(value.clubs) || value.clubs.length > 100 ||
      !Array.isArray(value.equipment) || value.equipment.length > 400 ||
      !value.clubs.every(row => row && id(row.id) && text(row.name)) ||
      !value.equipment.every(row => row && id(row.id) && text(row.label) && Object.hasOwn(clubEquipmentCategories, row.category))) return false;
  if (view === 'activities') return value.rows.length <= 500 && value.rows.every(row => row && id(row.id) &&
    text(row.title) && text(row.club_name) && text(row.location) && text(row.description) &&
    Object.hasOwn(clubCategories, row.category) && instant(row.starts_at) && instant(row.ends_at));
  if (view === 'review' && !value.manager) return false;
  return (value.student === null || (value.student && text(value.student.student_name) && text(value.student.student_number))) &&
    value.rows.length <= 100 && value.rows.every(row => row && validClubReceipt(row) && id(row.club_id) && instant(row.updated_at) &&
      date(row.pickup_on) && date(row.return_on) && items(row.items) && Object.hasOwn(clubPurposes, row.purpose) &&
      ['student_number','student_name','club_name','phone','other_purpose','collateral'].every(field => text(row[field])));
}
export function validClubReceipt(value) {
  return Boolean(value && id(value.id) && Number.isInteger(value.version) && value.version > 0 && value.version <= 1000000 &&
    Object.hasOwn(clubRequestStatuses, value.status));
}
export const mentionsClub = question => /\bclubs?\b|社團|社团/iu.test(question);

export function clubIntent(question, route = '') {
  if (/\b(?:club |borrow(?:ing)? |loaned? )equipment\b|\bequipment (?:borrowing|loan|request)\b|器材借用|借用器材/iu.test(question)) {
    if (/^(?:https:\/\/stu\.best)?\/school-affairs\/services\/30-2\/?(?:[?#]|$)/u.test(route) && !mentionsClub(question)) return null;
    return 'equipment';
  }
  if (/\b(?:student |campus )clubs?\b|\bclub (?:events?|activities)\b|社團活動|學生社團/iu.test(question)) return 'activities';
  return null;
}
export function clubGuide(question, intent, signedIn = false) {
  const zh = /[\u3400-\u9fff]/u.test(question);
  const route = clubPath + '/' + intent;
  const url = signedIn ? route : '/school-affairs/login?next=' + encodeURIComponent(route);
  const title = intent === 'equipment' ? (zh ? '器材借用' : 'Club equipment borrowing') : (zh ? '學生社團活動' : 'Student club activities');
  const claim = intent === 'equipment'
    ? (zh ? '可查看借用記錄。具社團資格者可選擇日期及器材後送出申請。' : 'Open the borrowing list. Students with a club membership can select dates and equipment and submit a request.')
    : (zh ? '可瀏覽每月活動，並開啟已發布活動的詳細資料。' : 'Browse the monthly calendar and open published activity details.');
  return { status:signedIn?'answered':'handoff', answer:'['+title+']('+url+')\n\n'+claim,
    citations:[{chunkId:'directory:student-clubs:'+intent,title,url,claim,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false} };
}
