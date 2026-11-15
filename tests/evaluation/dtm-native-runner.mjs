import {buildDtmNativeRouteCases} from './dtm-native-route-cases.mjs';
import {dtmAssignmentCases,dtmAssignmentFixture} from './dtm-assignment-native-cases.mjs';

const requirement='offline_dtm_native_fixture';
const assignmentPrefix='account:dtm-assignment-native-';
const gradePrefix='account:dtm-native-route-';

export function nativeDtmRunnerCases(){
  const grades=buildDtmNativeRouteCases().map(row=>({...row,fixtureRequirement:requirement,coveredTools:row.expected.requiredTools}));
  const assignments=dtmAssignmentCases.map(row=>{
    const hasRecord=row.fields&&row.mode!=='failed'&&row.mode!=='empty';
    const tools=row.fields?['dtmAssignment',...(row.companion?[row.companion]:[])]:[];
    const text=hasRecord?row.fields.filter(key=>!(key==='dueAt'&&row.mode==='null-deadline')&&!(key==='details'&&row.mode==='blank'))
      .map(key=>dtmAssignmentFixture[key]):[];
    return {id:assignmentPrefix+row.id,domain:'dtmAssignment',route:row.route,question:row.question,history:row.history,
      mode:row.mode==='empty'?'empty':'record',language:'en',fixtureKey:'offline:dtm-assignment:'+row.mode,fixtureRequirement:requirement,
      coveredTools:tools,offlineNativeCase:structuredClone(row),
      expected:{behavior:row.stop==='foreign_request'?'handoff':row.stop||row.excluded?'clarification':hasRecord?'answer':'unavailable',
        requiredText:text,allowedTools:tools,requiredTools:row.mode==='failed'?[]:tools,
        requiredAttemptedTools:tools,noAction:true,forbidPublicResearch:true,localLinksOnly:true}};
  });
  return [...grades,...assignments];
}

export function nativeDtmSetupRequired(testCase){
  return testCase?.fixtureRequirement===requirement||typeof testCase?.id==='string'
    &&(testCase.id.startsWith(assignmentPrefix)||testCase.id.startsWith(gradePrefix));
}

export function assertNativeDtmCaseReady(testCase){
  if(nativeDtmSetupRequired(testCase))
    throw new Error('Native DTM fixture and independent request observations are not mounted for this case.');
}
