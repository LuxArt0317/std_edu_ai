import capture from './curriculumMaps.json' with {type:'json'};

export const curriculumMapPath = '/school-affairs/services/12-7';
export const curriculumMapColleges = capture.colleges;
const entries = new Map(capture.colleges.flatMap(college=>college.entries.map(entry=>[entry.id,entry])));
export function curriculumMapEntry(id) {
  return entries.get(id);
}

export function curriculumMapSource(entry, page) {
  return new URL(page+'.asp?'+entry.selection,capture.source).href;
}
