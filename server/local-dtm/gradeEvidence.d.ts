import type {AffairsAccount} from '../affairsWorkspace.js';
import type {DtmGradeReportEvidenceOptions,DtmGradeReportEvidenceResult} from '../accountDtmGradeReportEvidence.js';
import {readLibrary} from './store.js';
export function readImportedDtmGradeEvidence(account:AffairsAccount,options?:DtmGradeReportEvidenceOptions,read?:typeof readLibrary):Promise<DtmGradeReportEvidenceResult|null>;
