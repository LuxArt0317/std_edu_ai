export const serviceLeadershipPath: '/school-affairs/services/42-1';
export type ServiceLeadershipView = {
  key:'preselection'|'confirmation'|'lectures'|'assignments';
  label:string;
  heading:string;
  source:string;
  lines:string[];
  englishLabel:string;
  english:string;
};
export const serviceLeadershipViews: ServiceLeadershipView[];
