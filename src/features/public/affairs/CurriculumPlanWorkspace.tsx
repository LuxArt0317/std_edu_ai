import { Link } from "react-router";
import {
  curriculumDocument,
  curriculumDocumentSource,
  curriculumPlansPath,
  curriculumProgramLabels,
  curriculumProgramPath,
  curriculumPrograms,
  curriculumTable,
} from "./curriculumPlans.js";
import "./curriculumPlans.css";

const assetRoot = "/stu-reference/curriculum/";

export function CurriculumPlans({ program = "1", archive = false, code }: {
  program?: string;
  archive?: boolean;
  code?: string;
}) {
  const plan = code ? curriculumDocument(code) : undefined;
  const source = code ? curriculumDocumentSource(code) : undefined;
  const table = code ? undefined : curriculumTable(program, archive);
  const activeProgram = plan?.program ?? table?.program;
  return (
    <div className="curriculum-plans" lang="zh-Hant">
      <main>
        <header>
          <h1>
            <Link to={curriculumPlansPath}>
              <img src={assetRoot + "logo.png"} width="70" height="70" alt="樹德科技大學" />
              <img src={assetRoot + "title.png"} width="187" height="49" alt="課程規劃表" />
            </Link>
          </h1>
          <nav aria-label="學制">
            {curriculumPrograms.map(item => (
              <Link key={item.code} to={curriculumProgramPath(item.code)}
                aria-current={activeProgram === item.code ? (table && !archive ? "page" : "true") : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="curriculum-plans-content">
          {table && <>
            <div className="curriculum-plans-scroll" tabIndex={0} role="region" aria-label="依系所與學年度查詢">
              <table>
                <caption className="sr-only">{curriculumProgramLabels[table.program]}課程規劃表</caption>
                <thead><tr>{table.rows[0].map((cell, index) => (
                  <th key={index} scope="col">{typeof cell === "string" ? cell : cell.text}</th>
                ))}</tr></thead>
                <tbody>
                  {table.rows.slice(1).map(([department, ...cells], row) => (
                    <tr key={row}>
                      <th scope="row">{typeof department === "string" ? department : department.text}</th>
                      {cells.map((cell, index) => <td key={index}>
                        {typeof cell === "string" ? cell : (
                          <Link to={curriculumPlansPath + "/plan/" + cell.code}>
                            <img src={assetRoot + "pdf.png"} width="16" height="16" alt="" />{cell.text}
                          </Link>
                        )}
                      </td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="curriculum-plans-links">
              <Link to={curriculumProgramPath(program, !archive)}>
                {archive ? "返回近期課程規劃" : "瀏覽十年以前的課程規劃"}
              </Link>
              <Link to={curriculumPlansPath + "/notes"}>個人備註</Link>
            </p>
          </>}
          {plan && source && <section aria-labelledby="curriculum-plan-title">
            <h2 id="curriculum-plan-title">{plan.department} · {plan.year} 學年度</h2>
            <p className="curriculum-document-actions">
              <Link to={curriculumProgramPath(plan.program, plan.archive)}>返回課程規劃表</Link>
              <a href={source} target="_blank" rel="noopener noreferrer">開啟校方 PDF</a>
            </p>
            <iframe title={plan.text + " 課程規劃 PDF"} src={"/api/affairs-data?scope=curriculum-plan&code=" + plan.code} />
          </section>}
          {!table && !plan && <p role="status">查無課程規劃資料。 <Link to={curriculumPlansPath}>返回課程規劃表</Link></p>}
        </div>
      </main>
      <footer>Shu-Te University 樹德科技大學 · 82445 高雄市燕巢區橫山路59號 · (07) 6158000</footer>
    </div>
  );
}
