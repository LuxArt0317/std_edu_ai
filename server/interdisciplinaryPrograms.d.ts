export interface InterdisciplinaryProgram {
  code: string;
  name: string;
  department: string;
  partners: string;
  year: string;
  credits: string;
  document_sha256: string | null;
}

export function loadInterdisciplinaryPrograms(options?: {fetchPrograms?: typeof fetch}): Promise<InterdisciplinaryProgram[]>;
export function serveInterdisciplinaryPrograms(request: {
  method?: string;
  query?: Record<string,string|string[]|undefined>;
}, response: {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}): Promise<void>;
