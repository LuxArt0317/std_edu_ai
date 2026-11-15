import type {AccountEvaluationCase} from './account-cases.mjs';

export interface ServiceEvaluationCase extends AccountEvaluationCase {
  serviceId: string;
  mode: 'navigation' | 'record' | 'empty' | 'action-boundary';
}

export function buildServiceCases(): ServiceEvaluationCase[];
