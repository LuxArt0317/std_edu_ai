export interface DirectSchoolPage {
  route: string;
  file: string;
  title: string;
  checksum: string;
}

export function directSchoolPages(root: string): Map<string, DirectSchoolPage>;
export function renderDirectSchoolPage(root: string, page: DirectSchoolPage): string;
export function copyDirectSchoolPages(root: string, output: string): number;
