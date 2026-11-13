import { Link } from "react-router";
import {
  parkingInstructionsPath,
  parkingInstructionsUrl,
  parkingOfficeUrl,
  parkingPermitPath,
} from "./parkingPermits.js";
import "./parkingPermits.css";

export function ParkingPermitWorkspace({ instructions }: { instructions: boolean }) {
  return (
    <div className="parking-permits" lang="zh-Hant">
      <header>
        <nav aria-label="車證申請">
          <Link to={parkingInstructionsPath} aria-current={instructions ? "page" : undefined}>申請須知</Link>
        </nav>
      </header>
      {instructions ? (
        <main className="parking-permits-instructions">
          <h1>申請需知</h1>
          <iframe title="車輛通行證申請須知 PDF" src={parkingInstructionsUrl} referrerPolicy="no-referrer" />
          <nav aria-label="申請須知連結">
            <a href={parkingInstructionsUrl} target="_blank" rel="noopener noreferrer">開啟 PDF</a>
            <Link to={parkingPermitPath}>返回車證申請</Link>
          </nav>
        </main>
      ) : (
        <main className="parking-permits-entry">
          <h1 className="sr-only">汽機車證申請</h1>
          <a className="parking-permits-apply" href={parkingOfficeUrl} target="_blank" rel="noopener noreferrer">
            進入車證申請
          </a>
          <p className="parking-permits-notice">校方車證系統需進行兩次登入認證。</p>
          <ol className="parking-permits-signin">
            <li><h2>Google 帳戶</h2><p>使用完整的學校電子郵件地址登入。</p></li>
            <li><h2>校務資訊網帳戶</h2><p>在校方頁面完成第二次認證。</p></li>
          </ol>
          <footer>
            <Link to="/school-affairs/menu/swd/all">總務資訊</Link>
            <Link to={parkingPermitPath + "/notes"}>個人備註</Link>
          </footer>
        </main>
      )}
    </div>
  );
}
