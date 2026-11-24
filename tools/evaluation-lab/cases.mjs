import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const faqImportVersion = "survey-faq-v1";
const faqDocument = resolve(process.cwd(), "docs/guides/SURVEY_FAQ.md");
const accountRoutes = new Map([
  [3, "/school-affairs/services/39-1"],
  [5, "/school-affairs/services/9-1"],
  [12, "/school-affairs/services/leave/history"],
  [13, "/school-affairs/services/11-2"],
  [15, "/school-affairs/services/15-1"],
  [16, "/school-affairs/services/11-1"],
  [17, "/school-affairs/services/11-1"],
  [18, "/school-affairs/services/13-1"],
  [22, "/dtm/assignments"],
  [24, "/dtm"],
  [27, "/school-affairs/services/15-1"],
  [49, "/school-affairs/services/47-1"],
]);

/** Import authored FAQ prose, without inventing keyword-based truth scores. */
export function evaluationLabCases() {
  const markdown = readFileSync(faqDocument, "utf8").replace(/\r\n/g, "\n");
  const content = markdown.split("\n## Maintainer notes")[0];
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
    const scope = accountRoutes.has(number) ? "account" : "public";
    const firstLink = expectedAnswer.match(
      /\]\((https:\/\/stu\.best\/[^\s)]*)\)/,
    )?.[1];
    const route =
      accountRoutes.get(number) ||
      (firstLink ? new URL(firstLink).pathname : "/");
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
      referenceOrigin: `Survey FAQ · Q${match[1]} · docs/guides/SURVEY_FAQ.md (24 Nov 2026). Personal questions require account facts; no fixed personal values are supplied.`,
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
