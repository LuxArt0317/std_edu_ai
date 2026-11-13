import { interdisciplinaryProgramsPath } from '../src/features/public/affairs/studentServices.js';
import { schoolAffairsDatabaseConfiguration } from './affairsWorkspace.js';

const table = 'affairs_interdisciplinary_programs';
const source = 'https://info.stu.edu.tw/ACA/teacher/QryIntraCourse/qryIntraCourse.asp';
const columns = 'code,name,department,partners,year,credits,document_sha256';

export async function loadInterdisciplinaryPrograms({fetchPrograms = fetch} = {}) {
  const {url,key} = schoolAffairsDatabaseConfiguration();
  const target = new URL(url + '/rest/v1/' + table);
  target.search = new URLSearchParams({select:columns,order:'code.asc',limit:'501'}).toString();
  const response = await fetchPrograms(target, {
    headers:{apikey:key},
    signal:AbortSignal.timeout(6000),
    redirect:'error',
  });
  if (!response.ok) throw new Error('Program directory unavailable');
  const programs = await response.json();
  if (!Array.isArray(programs) || programs.length > 500) throw new Error('Invalid program directory response');
  return programs;
}

export async function serveInterdisciplinaryPrograms(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  const {scope,...extras} = request.query ?? {};
  if (scope !== 'interdisciplinary-programs' || Object.keys(extras).length) {
    response.status(400).json({error:'Choose only the program directory scope.'});
    return;
  }
  try {
    response.status(200).json({programs:await loadInterdisciplinaryPrograms()});
  } catch {
    response.status(503).json({error:'The program directory is temporarily unavailable.'});
  }
}

export async function answerInterdisciplinaryPrograms(question, {readPrograms = loadInterdisciplinaryPrograms, onRead} = {}) {
  const codes = new Set(Array.from(question.matchAll(/\bPU[0-9]{3}\b/gi), match => match[0].toUpperCase()));
  if (codes.size > 1) return null;
  const [code] = codes;
  const count = /\b(?:how many|number of|count(?: the)?) (?:interdisciplinary|interdepartmental|intramural) (?:credit )?programs?(?: (?:are there|are listed|are available|exist))?\s*[?.!]*$|跨院系學分學程(?:總共)?有(?:幾個|多少個)[？?。]*$/i.test(question);
  const listsPrograms = /\b(?:list (?:the )?|what (?:are the )?|which )(?:interdisciplinary|interdepartmental|intramural) (?:credit )?programs?(?: (?:are there|are listed|are available|exist))?\s*[?.!]*$|(?:有哪些跨院系學分學程|跨院系學分學程有哪些|列出跨院系學分學程)[？?。]*$/i.test(question);
  if ((!code && !count && !listsPrograms) ||
      /\b(?:my|our|eligible|eligibility|qualify|earned|graduate|completed|am i|can i|password|access_token|refresh_token)\b|我的|我能|我可|資格|畢業|已修|密碼/i.test(question)) return null;
  const zh = /[\u3400-\u9fff]/u.test(question);
  const title = zh ? '跨院系學分學程查詢' : 'Interdisciplinary credit programs';
  onRead?.();
  try {
    const programs = await readPrograms();
    const program = code ? programs.find(entry=>entry.code === code) : undefined;
    const href = program?.document_sha256 ? interdisciplinaryProgramsPath + '/program/' + code : interdisciplinaryProgramsPath;
    const answer = program
      ? zh
        ? `**${program.code} · ${program.name}**：${program.credits} 學分，設置單位為${program.department}，成立於民國 ${Number(program.year)} 年。${program.partners ? ` 參與教學單位：${program.partners}。` : ''}`
        : `**${program.code} · ${program.name}** requires **${program.credits} credits**. The offering unit is ${program.department}, and the program was established in ROC year ${Number(program.year)} (${Number(program.year) + 1911}).${program.partners ? ` Participating units: ${program.partners}.` : ''}`
      : code
        ? zh ? `目前公布的目錄中沒有 ${code}。` : `${code} is absent from the published directory.`
        : count
          ? zh ? `目前目錄有 **${programs.length} 個**跨院系學分學程。` : `The published directory lists **${programs.length} interdisciplinary credit programs**.`
          : programs.length
            ? (zh ? `目前目錄有 ${programs.length} 個學程，以下列出最多八個。\n\n` : `The directory lists ${programs.length} programs. Here are up to eight.\n\n`)
              + programs.slice(0,8).map(entry=>`- ${entry.code} · ${entry.name} (${entry.credits} ${zh ? '學分' : 'credits'})`).join('\n')
            : (zh ? '目前沒有已公布的學分學程。' : 'The published directory is empty.');
    const link = zh ? '查看站內學程資料' : 'View the directory on stu.best';
    return {
      status: code && !program ? 'handoff' : 'answered',
      answer:answer+'\n\n['+link+']('+href+')',
      citations:[{chunkId:'interdisciplinary-programs:'+(program?.code ?? 'directory'),title,sourceName:'stu.best School Affairs',url:href,locator:source,effectiveAt:null,reviewedAt:null}],
      suggestedQuestions:[],
      grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
      activity:[{kind:'directory',label:'Queried the interdisciplinary program directory',detail:title,status:'complete'}],
    };
  } catch {
    return {
      status:'handoff',
      answer:zh ? '目前無法讀取跨院系學分學程資料，請稍後再試。' : 'The interdisciplinary program directory is temporarily unavailable. Please try again.',
      citations:[],
      suggestedQuestions:[],
      grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
      activity:[{kind:'directory',label:'Queried the interdisciplinary program directory',detail:title,status:'unavailable'}],
    };
  }
}
