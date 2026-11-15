import {runAnswerVerification} from './answerVerification.js';
import {loadDtmCourseResource, parseDtmCourseResourceData, loadDtmCourseMaterialList,
  parseDtmCourseMaterialList, dtmMaterialListLimit} from './dtmCourseResource.js';
import {dtmMaterialIntent} from './dtmMaterialIntent.js';

const sourceId = 'account:dtmMaterials';
const maxSummary = 1500;
const kinds = ['page','file','assignment'];
const materialLabel = {page:['Page','頁面'],file:['File','檔案'],assignment:['Assignment resource','作業資源']};

function materialLink(courseId, materialId) {
  return '/dtm/course/' + courseId + '/material/' + materialId;
}
function literal(text) {
  return text.replace(/[\u0001-\u001f\u007f-\u009f]/gu, ' ').replace(/[&<>"'\x60*_[\]()#!~|]/gu, char => '&#' + char.charCodeAt(0) + ';');
}
function materialTitle(title) {
  if ([...title].length > 240) throw new RangeError('Material title exceeds the evidence limit.');
  return title;
}
function includeSummary(summary) {
  return [...summary].length <= maxSummary && literal(summary).length <= 4000 ? summary : null;
}
async function readMaterial(account, selection, deadline, {loadResource, loadMaterials}) {
  const {courseId,materialId,summary,destination} = selection;
  const caller = {...account,requestDeadline:Math.min(deadline,account.requestDeadline ?? Infinity,Date.now() + 8_000)};
  const uid = account.user.id;
  if (materialId) {
    const raw = await loadResource(caller,{courseId,materialId});
    const {material} = parseDtmCourseResourceData(raw,uid,courseId,materialId);
    if (!material) return {rows:[],complete:true};
    const row = {id:material.id,title:materialTitle(material.title),kind:material.kind,sourceMode:material.sourceMode};
    if (summary) row.summary = includeSummary(material.summary);
    if (destination) row.linkAvailable = material.targetUrl !== null;
    return {rows:[row],complete:row.summary !== null};
  }

  const {dtm_materials:materials} = parseDtmCourseMaterialList(await loadMaterials(caller,{courseId}),uid,courseId);
  const rows = [];
  let titleBudget = 4000;
  for (const {id,title,kind,source_mode:sourceMode} of materials.slice(0,dtmMaterialListLimit)) {
    const savedTitle = materialTitle(title);
    titleBudget -= literal(savedTitle).length;
    if (titleBudget < 0) break;
    rows.push({id,title:savedTitle,kind,sourceMode});
  }
  return {rows,complete:rows.length === materials.length};
}

function formatMaterial(selection, question, evidence) {
  if (evidence.length !== 1 || evidence[0].id !== sourceId || evidence[0].url !== selection.path) throw new TypeError('Material evidence does not match the selected page.');
  const {complete,rows} = JSON.parse(evidence[0].content);
  const zh = /\p{Script=Han}/u.test(question);
  const say = (en, cn) => zh ? cn : en;
  const title = selection.materialId ? say('Open Moodle material','開啟 Moodle 教材') : say('Open course materials','開啟課程教材');
  const link = '[' + title + '](' + selection.path + ')';
  const lines = [];
  const citations = [{chunkId:sourceId,title,url:selection.path}];
  if (!rows.length) lines.push(complete
    ? selection.materialId ? say('I found no saved resource at this exact Moodle link.','這個 Moodle 連結沒有相符的已儲存教材。')
      : say('I found no saved material resources for this Moodle course.','這門 Moodle 課程沒有已儲存的教材資源。')
    : say('The retrieved page contains no material rows. There may be more on later pages.','已查核的資料頁沒有教材，後續頁面可能仍有紀錄。'));
  else if (selection.materialId) {
    const record = rows[0];
    if (record.id !== selection.materialId || !kinds.includes(record.kind)) throw new TypeError('Wrong material record.');
    const label = materialLabel[record.kind][zh ? 1 : 0];
    lines.push('**' + literal(record.title) + '** · ' + label + (record.sourceMode === 'sample' ? say(' · Sample material',' · 範例教材') : ''));
    if (Object.hasOwn(record,'summary')) lines.push(record.summary === null
      ? say('The saved description is too long to display here.','儲存的說明太長，無法在此顯示。')
      : record.summary ? say('Saved description: ','儲存的說明：') + literal(record.summary)
        : say('There is no saved description for this material.','此教材沒有已儲存的說明。'));
    if (Object.hasOwn(record,'linkAvailable')) lines.push(record.linkAvailable
      ? say('The saved link is available on the material page.','教材頁上有已儲存的資源連結。')
      : say('This material has no saved destination link.','此教材沒有已儲存的資源連結。'));
  } else {
    lines.push(say('Here are the saved resources I found for this Moodle course.','以下是這門 Moodle 課程中找到的已儲存教材。'));
    lines.push(rows.map(row => {
      const title = literal(row.title);
      const url = materialLink(selection.courseId,row.id);
      const label = materialLabel[row.kind][zh ? 1 : 0];
      return '- [' + title + '](' + url + ') · ' + label + (row.sourceMode === 'sample' ? say(' · Sample',' · 範例') : '');
    }).join('\n'));
  }
  if (!complete && !selection.materialId && rows.length) lines.push(say('This is a partial list. Open the course for the rest.','這是部分教材。請開啟課程查看更多。'));
  if (selection.contents) lines.push(say('I can check the saved material details. I haven’t opened or downloaded the linked file.','我可查核已儲存的教材資料，但未開啟或下載連結檔案。'));
  lines.push(link);
  return {status:'answered',answer:lines.join('\n\n'),citations,
    suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
}

/** Exact caller evidence stays in the request closure and never goes to an LLM,
 * third-party resource or analytics. A failed read gets the standard graph retry. */
export async function answerDtmMaterial({account,selection,question,deadline,onProgress},
  loaders = {loadResource:loadDtmCourseResource,loadMaterials:loadDtmCourseMaterialList}) {
  const currentSelection = dtmMaterialIntent(question,selection.path);
  if (selection.reason || !currentSelection || currentSelection.reason || selection.courseId !== currentSelection.courseId
    || selection.materialId !== currentSelection.materialId || selection.path !== currentSelection.path)
    throw new TypeError('Invalid Moodle material selection.');
  const caller = Object.freeze({...account,user:Object.freeze({id:account.user.id})});
  const activity = [];
  const progress = step => {
    const index = activity.findIndex(item => item.kind === step.kind);
    if (index === -1) activity.push(step);
    else activity[index] = step;
    try {onProgress?.(step);} catch {/* Stream disconnected. */}
  };
  const load = async attempt => {
    const kind = 'account-read:dtmMaterials:' + attempt;
    const label = 'Checked saved Moodle materials';
    const emit = (detail,status) => progress({kind,label,detail,status});
    try {
      const payload = await readMaterial(caller,currentSelection,deadline,loaders);
      emit(payload.complete ? 'Checked the selected local material records.' : 'Some saved details are outside this result.', 'complete');
      return [{id:sourceId,url:currentSelection.path,content:JSON.stringify(payload)}];
    } catch {
      emit('The selected Moodle record could not be loaded.', 'unavailable');
      return [];
    }
  };
  const first = await load(1);
  const format = evidence => formatMaterial(currentSelection,question,evidence);
  const initial = first.length ? format(first) : {status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const result = await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress:progress,
    loadEvidence:async ({attempt}) => attempt === 1 ? first : load(attempt),
    verify:async ({candidate,evidence}) => {
      if (!evidence.length) return {ok:false,reason:'evidence_unavailable'};
      const supported = format(evidence);
      return {ok:candidate.answer === supported.answer && JSON.stringify(candidate.citations) === JSON.stringify(supported.citations)};
    },
    repair:async ({evidence}) => evidence.length ? format(evidence) : initial,
  });
  return {...result,activity};
}
