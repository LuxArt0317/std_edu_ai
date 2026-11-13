import { useEffect, useState } from "react";
import { Link } from "react-router";
import {readPublishedInterdisciplinaryPrograms} from "@/services/interdisciplinaryPrograms";
import type { InterdisciplinaryProgram } from "../../../../server/interdisciplinaryPrograms.js";
import { interdisciplinaryProgramsPath as root } from "./studentServices.js";
import "./interdisciplinaryPrograms.css";

const assets = "/stu-reference/interdisciplinary/";
const columns = [
  ["code", "學程編號"],
  ["name", "學分學程名稱"],
  ["department", "設置單位"],
  ["partners", "其它參與教學單位"],
  ["year", "成立年度"],
  ["credits", "取得學分學程總學分"],
] as const;
type Column = typeof columns[number][0];

export function InterdisciplinaryPrograms({ code }: { code?: string }) {
  const [programs, setPrograms] = useState<InterdisciplinaryProgram[]>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<{ column: Column; descending: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const catalog = await readPublishedInterdisciplinaryPrograms(controller.signal);
        if (!controller.signal.aborted) setPrograms(catalog);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const selected = code ? programs?.find(program => program.code === code && program.document_sha256) : undefined;
  const sorted = sort ? programs?.slice().sort((a, b) => {
    const { column, descending } = sort;
    const comparison = column === "year" || column === "credits"
      ? Number(a[column]) - Number(b[column])
      : a[column].localeCompare(b[column], "zh-Hant");
    return (descending ? -comparison : comparison) || a.code.localeCompare(b.code);
  }) : programs;
  const title = "跨院系學分學程查詢";

  return <div className="interdisciplinary-programs" lang="zh-Hant">
    <main>
      <header>
        <div className="interdisciplinary-banner" lang="en">
          <span>Campus Information Services</span><span>Shu-Te University</span>
        </div>
        <h1><img src={assets + "logo.png"} width="55" height="55" alt="" />{title}</h1>
      </header>
      <div className="interdisciplinary-content">
        <h2>跨院系學分學程 <span lang="en">Intramural Courses across the departments and colleges</span></h2>
        {error && <p role="alert">學程資料暫時無法載入。 <button type="button" onClick={() => {
          setError(false);
          setAttempt(value => value + 1);
        }}>重試</button></p>}
        {!programs && !error && <p role="status">載入學分學程…</p>}
        {sorted && !code && <>
          <div className="interdisciplinary-table" role="region" aria-label={title} tabIndex={0}>
            <table>
              <caption className="sr-only">{title}</caption>
              <thead><tr>{columns.map(([column, label]) => <th key={column} scope="col"
                aria-sort={sort?.column === column ? (sort.descending ? "descending" : "ascending") : undefined}>
                <button type="button" onClick={() => setSort(previous => ({
                  column, descending: previous?.column === column && !previous.descending,
                }))}>
                  {label}<span aria-hidden="true">{sort?.column === column ? (sort.descending ? "▾" : "▴") : "↕"}</span>
                </button>
              </th>)}</tr></thead>
              <tbody>{sorted.map(program => <tr key={program.code}>
                <th scope="row">{program.code}</th>
                <td>{program.document_sha256 ? <Link to={root + "/program/" + program.code}>{program.name}</Link> : program.name}</td>
                <td>{program.department}</td>
                <td>{program.partners}</td>
                <td>{program.year}</td>
                <td>{program.credits}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!sorted.length && <p role="status">目前沒有已公布的學分學程。</p>}
          <p className="interdisciplinary-links"><Link to={root + "/notes"}>個人備註</Link></p>
        </>}
        {code && programs && <section aria-label={selected?.name ?? "學程文件"}>
          <p className="interdisciplinary-links"><Link to={root}>返回學分學程清單</Link></p>
          {selected ? <>
            <h3>{selected.code} · {selected.name}</h3>
            <p className="interdisciplinary-links"><a href={assets + selected.code + ".pdf"} download>下載 PDF</a></p>
            <iframe title={selected.name + " PDF"} src={assets + selected.code + ".pdf"} />
          </> : <p role="status">找不到此學程的文件。</p>}
        </section>}
      </div>
    </main>
  </div>;
}
