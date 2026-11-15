export type DtmMaterialSelection = {
  courseId: string | null;
  materialId: string | null;
  path: string | null;
  summary: boolean;
  destination: boolean;
  contents: boolean;
  feeQuestion: string | null;
  hasOtherQuestion: boolean;
  reason: 'foreign' | 'excluded' | 'operation' | 'choose' | null;
};
export function dtmMaterialRoute(route: unknown): RegExpExecArray | null;
export function dtmMaterialIntent(question: string, route?: string): DtmMaterialSelection | null;
export function dtmMaterialBoundary(selection: DtmMaterialSelection, question: string, signedIn: boolean): {
  status: string; answer: string; citations: {title: string; url: string}[]; suggestedQuestions: string[];
  grounding: {source: string; webSearched: boolean};
};
