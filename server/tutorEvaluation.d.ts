import type {AffairsAccount} from './affairsWorkspace.js';
import type {TutorEvaluationData,TutorEvaluationReceipt} from './tutorEvaluationContract.js';
type Account = AffairsAccount & {requestDeadline?:number};
export function loadTutorEvaluation(account:Account):Promise<TutorEvaluationData>;
export function submitTutorEvaluation(account:Account,payload:unknown):Promise<TutorEvaluationReceipt>;
