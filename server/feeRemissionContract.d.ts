export const feeRemissionPath: '/school-affairs/services/21-3';
export const feeRemissionKinds: readonly ['save_fee_remission', 'delete_fee_remission'];
export const feeRemissionFields: readonly [
  readonly ['academic_year_text', '學年', 40],
  readonly ['semester_text', '學期', 40],
  readonly ['student_number', '學號', 80],
  readonly ['category_text', '類別', 160],
  readonly ['amount_text', '金額', 80],
  readonly ['check_status_text', '檢核狀態', 160],
  readonly ['notes_text', '備註說明', 2000],
];
export const feeRemissionMaxPayloadBytes: 8192;
export const feeRemissionMaxResponseBytes: number;
export const feeRemissionMaxRows: 250;
export type FeeRemissionCell = typeof feeRemissionFields[number][0];
export type FeeRemissionFields = Record<FeeRemissionCell, string | null> & {row_order: number};
export type FeeRemissionRecord = FeeRemissionFields & {id: string; version: number};
export type FeeRemissionHistory = {userId: string; records: FeeRemissionRecord[]};
export type FeeRemissionKind = typeof feeRemissionKinds[number];
export type FeeRemissionEnvelope = {id: string; user_id: string; request_id: string; expected_version: number};
export type FeeRemissionAction =
  | {kind: 'save_fee_remission'; payload: FeeRemissionEnvelope & FeeRemissionFields}
  | {kind: 'delete_fee_remission'; payload: FeeRemissionEnvelope};
export type FeeRemissionReceipt = {id: string; kind: FeeRemissionKind; version: number};
export function feeRemissionUuid(value: unknown): value is string;
export function validateFeeRemissionPayload(kind: unknown, payload: unknown): boolean;
export function parseFeeRemission(value: unknown, userId: string): FeeRemissionHistory;
export function parseFeeRemissionReceipt(value: unknown, action: FeeRemissionAction): FeeRemissionReceipt;
export function readFeeRemissionJson(response: Response): Promise<unknown>;
