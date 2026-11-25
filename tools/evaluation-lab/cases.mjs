import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {createHash} from "node:crypto";

export const faqImportVersion = "spreadsheet-faq-v2";
const faqDocument = resolve(process.cwd(), "docs/question-answer/README.md");
export const faqDocumentHash=()=>createHash("sha256").update(readFileSync(faqDocument)).digest("hex");


/** Import authored FAQ prose, without inventing keyword-based truth scores. */
export function evaluationLabCases() {
  const markdown = readFileSync(faqDocument, "utf8").replace(/\r\n/g, "\n");
  const content = markdown.split("\n## Maintainer notes")[0];
  const settingsText=markdown.match(/```evaluation-lab-config\s*\n([\s\S]*?)\n```/);
  if(!settingsText)throw new Error("The reference README is missing evaluation settings.");
  const settings=JSON.parse(settingsText[1]);
  const sections = [...content.matchAll(/^## (\d+)\. (.+)$/gm)];
  const questions = [
    ...content.matchAll(
      /^### Q(\d+)\. (.+)\n\n([\s\S]*?)(?=^### Q\d+\.|^## |$(?![\s\S]))/gm,
    ),
  ];
  if (!questions.length)
    throw new Error("The survey FAQ contains no question and answer entries.");
  return questions.map((match) => {
    const number = Number(match[1]);
    const section = sections.filter((item) => item.index < match.index).at(-1);
    const expectedAnswer = match[3].replace(/^\*\*Answer:\*\*\s*/, "").trim();
    if (!expectedAnswer)
      throw new Error(`FAQ Q${match[1]} has no expected answer.`);
    const config=settings[`Q${String(number).padStart(2,"0")}`];
    if(!config||!['public','account'].includes(config.scope)||typeof config.route!=='string'||!/^\/(?!\/)[^\s#]*$/.test(config.route))throw new Error(`Invalid evaluation settings for Q${match[1]}`);
    const scope = config.scope;
    const route = config.route;
    return {
      id: `survey-faq-q${match[1]}`,
      question: match[2].trim(),
      expectedAnswer,
      domain: section
        ? `Survey ${section[1].padStart(2, "0")} · ${section[2]}`
        : "Survey FAQ",
      route,
      scope,
      endpoint:
        scope === "account"
          ? "/api/affairs-assistant"
          : "/api/research-assistant",
      enabled: true,
      version: 1,
      referenceOrigin: `School question spreadsheet · row ${number} · docs/question-answer/README.md (25 Nov 2026). Personal questions require authorized account facts; no fixed personal values are supplied.`,
      expected: {
        behavior: "answer",
        requiredText: [],
        forbiddenText: [],
        requiredLinks: [],
        noAction: true,
      },
    };
  });
}
