export const programRegistrationPath: '/school-affairs/services/7-3';
export const programRegistrationScope: 'program-registrations';
export const programRegistrationAction: 'change_program_registration';
export function programCode(value: unknown): value is string;
export interface ProgramRegistration {
  user_id: string;
  program_code: string;
  academic_year: number;
  semester: number;
  withdrawn_year: number | null;
  withdrawn_semester: number | null;
  completed_year: number | null;
  completed_semester: number | null;
  version: number;
}
export type ProgramRegistrationAction = {
  program_code: string;
  request_id: string;
  expected_version: number;
  operation: 'register' | 'withdraw';
};
export function validProgramRegistrationAction(value: unknown): value is ProgramRegistrationAction;
export function parseProgramRegistrations(value: unknown,userId: string): ProgramRegistration[];
export function parseProgramRegistrationReceipt(value: unknown,userId: string,payload: ProgramRegistrationAction): {
  userId: string; requestId: string; programCode: string; version: number;
};
export function isProgramRegistrationQuestion(question: string): boolean;
