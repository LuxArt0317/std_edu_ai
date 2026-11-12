import { useEffect, useState } from 'react';

export type DtmLocale = 'zh-Hant'|'en';
export type DtmTranslate = (traditionalChinese:string,english:string)=>string;
const key = 'stu-dtm-language';

export function useDtmLocale() {
  const [locale,setLocale] = useState<DtmLocale>(() => {
    try { return localStorage.getItem(key)==='en'?'en':'zh-Hant'; }
    catch { return 'zh-Hant'; }
  });
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => { document.documentElement.lang = previous; };
  },[locale]);
  function changeLocale(value:DtmLocale) {
    setLocale(value);
    try { localStorage.setItem(key,value); } catch { /* The current tab can still change language. */ }
  }
  const t:DtmTranslate = (zh,en) => locale==='en'?en:zh;
  return {locale,changeLocale,t};
}

export function termLabel(term:string,t:DtmTranslate) {
  const parts=/^(\d{2,3})學年度第(\d)學期\s*$/.exec(term);
  return parts ? t(term,'Academic year '+parts[1]+' · Semester '+parts[2]) : term;
}

export function taipeiDateTimeInput(value:string|null) {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
}

export function deadlineLabel(value:string|null,t:DtmTranslate) {
  if (!value) return t('無截止日期','No deadline');
  return new Intl.DateTimeFormat(t('zh-TW','en-GB'),{
    dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei',
  }).format(new Date(value)) + t('（臺灣時間）',' Taipei');
}
