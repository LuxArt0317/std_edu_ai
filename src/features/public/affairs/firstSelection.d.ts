export const firstSelectionPath: '/school-affairs/services/6-1';
export const firstSelectionFeesPath: '/school-affairs/services/6-1/fees';
export const firstSelectionScope: 'first-selection-notice';
export const firstSelectionSource: string;
export const firstSelectionFeeSource: string;
export const firstSelectionPhases: readonly string[];
export function firstSelectionQuestion(question: string, route?: string): 'schedule' | 'fees' | null;
export function firstSelectionDate(instant: Date, locale?: string): string;
export function firstSelectionTableDate(instant: Date): string;

export interface FirstSelectionWindow {
  phase: 1 | 2 | 3;
  opensAt: string;
  closesAt: string;
  audience: string;
  audienceEn: string;
  details: string;
}
export interface FirstSelectionNotice {
  academicYear: number;
  semester: 1 | 2;
  observedOn: string;
  notices: string[];
  reminders: string[];
  feeNotes: string[];
  feeNotesEn: string[];
  windows: FirstSelectionWindow[];
}
