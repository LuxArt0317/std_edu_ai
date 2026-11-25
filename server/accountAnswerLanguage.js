export const savedRecordWriting='Lead with the requested result. Use a short affirmative source label such as “saved School Affairs records” or “sample DTM data” when needed, and label sample or local_demo facts without repeating a disclaimer. Explain a source boundary only when the question asks about official verification, live synchronization or another unsupported institution-level result, or when it explains a specific missing or partial result. Never imply authority or action the evidence does not establish.';

export function asksAboutOfficialRecords(question){
  return /\bofficial\b|\blive (?:university|school|STU|Moodle)\b|\b(?:university|school|STU|Moodle)[ -](?:verified|sync(?:ed|hroni[sz]ed|hronization)?)\b|官方|校方.{0,6}(?:正式|驗證|同步|紀錄)|正式(?:紀錄|成績單)|即時同步/iu.test(question);
}
