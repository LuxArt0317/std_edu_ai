import capture from './curriculumPlans.json' with {type:'json'};

export const curriculumPlansPath = '/school-affairs/services/12-5';
export const curriculumProgramLabels = {
  '1':'四技日間部', '2':'二技日間部', '3':'四技進修部', '4':'二技在職專班',
  '5':'二技進修部', '6':'碩士班', '7':'碩士在職專班', '8':'博士班',
  'A':'進修專校', '9':'產學四技學士專班', 'B':'二專日間部', 'D':'二專進修部',
};
const programs = ['1','2','3','4','5','6','7','8','A','9','B','D'];
export const curriculumPrograms = programs.map(code=>({code,label:curriculumProgramLabels[code]}));

const tables = new Map(capture.tables.map(table=>[table.program+(table.archive?'/archive':''),table]));
const documents = new Map();
for (const table of capture.tables) {
  const [, ...years] = table.rows[0];
  for (const [department,...cells] of table.rows.slice(1)) {
    for (const [index,cell] of cells.entries()) {
      if (typeof cell==='string'||documents.has(cell.code)) continue;
      documents.set(cell.code,{...cell,department,year:years[index],program:table.program,archive:table.archive});
    }
  }
}
export function curriculumTable(program='1', archive=false) {
  return tables.get(program+(archive?'/archive':''));
}
export function curriculumDocument(code) {
  return documents.get(code);
}
export function curriculumDocumentSource(code) {
  const document=curriculumDocument(code);
  if (!document) return undefined;
  return 'https://info.stu.edu.tw/ACA/teacher/QryCoursedept/DownLoadFileori.asp?Sec='+document.code;
}
export function curriculumProgramPath(program, archive=false) {
  return curriculumPlansPath+(program==='1'&&!archive?'':'/program/'+program+(archive?'/archive':''));
}
