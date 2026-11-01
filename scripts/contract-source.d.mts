export function readContractSource(file: string | URL, options: BufferEncoding): string;
export function readContractSource(file: string | URL): Buffer;
export function readContractSourceAsync(file: string | URL, options: BufferEncoding): Promise<string>;
export function readContractSourceAsync(file: string | URL): Promise<Buffer>;
