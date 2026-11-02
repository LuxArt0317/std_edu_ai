import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  UserRound,
  LockKeyhole,
  KeyRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { referenceAsset } from "../site/reference";
import SchoolAffairsPortal from "./SchoolAffairsPortal";
import {
  closeAffairsPreview,
  hasAffairsPreview,
  openAffairsPreview,
} from "./previewSession";
import "./login.css";
const base = "https://info.stu.edu.tw/ePortal/";
export default function SchoolAffairsEntry() {
  const location = useLocation(),
    navigate = useNavigate();
  const [preview, setPreview] = useState(hasAffairsPreview);
  const [panel, setPanel] = useState(""),
    [photo, setPhoto] = useState(0);
  const exit = /\/(signed-out|login)\/?$/.test(location.pathname);
  useEffect(() => {
    if (exit) {
      closeAffairsPreview();
    }
    if (exit || !hasAffairsPreview())
      document.title = "校務系統登入 · 介面預覽";
  }, [exit, location.pathname]);
  if (preview && !exit && hasAffairsPreview()) return <SchoolAffairsPortal />;
  return (
    <main
      className="affairs-login"
      style={{
        backgroundImage: `url("${referenceAsset(base + "assets/css/images/pattern.jpg")}")`,
      }}
    >
      <div className="affairs-login-wrap">
        <h1 aria-label="校務系統登入">
          <img
            src={referenceAsset(base + "assets/img/stu/stuLogo.svg")}
            alt="樹德科技大學 SHU-TE UNIVERSITY"
            width="220"
            height="37"
          />
          <span className="sr-only">校務系統登入</span>
        </h1>
        <section className="affairs-login-card" aria-label="校務系統登入介面">
          <div className="affairs-login-photo">
            <img
              src={referenceAsset(
                base +
                  (photo === 0
                    ? "assets/images/stu9.jpg"
                    : "assets/images/stu0.jpg"),
              )}
              alt={photo === 0 ? "校園健身中心" : "校園建築"}
              width="900"
              height="600"
            />
            <Button
              variant="ghost"
              aria-label="Previous campus photo"
              onClick={() => setPhoto(photo === 0 ? 1 : 0)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              aria-label="Next campus photo"
              onClick={() => setPhoto(photo === 0 ? 1 : 0)}
            >
              <ChevronRight />
            </Button>
          </div>
          <p className="affairs-login-preview">
            介面預覽 · 尚未連接校方登入，不接收真實帳號、密碼或驗證碼。
          </p>
          <form
            onSubmit={(event) => event.preventDefault()}
            aria-describedby="affairs-login-status"
          >
            <fieldset disabled>
              <Label htmlFor="affairs-account">帳號(Account)</Label>
              <div className="affairs-login-field">
                <Input
                  id="affairs-account"
                  placeholder="s+學號為帳號，如 s10101105"
                  autoComplete="off"
                />
                <UserRound aria-hidden="true" />
              </div>
              <Label htmlFor="affairs-password">密碼(Password)</Label>
              <div className="affairs-login-field">
                <Input
                  id="affairs-password"
                  type="password"
                  autoComplete="off"
                />
                <LockKeyhole aria-hidden="true" />
              </div>
              <Label htmlFor="affairs-captcha">驗證碼(Captcha)</Label>
              <div className="affairs-login-field">
                <Input id="affairs-captcha" autoComplete="off" />
                <KeyRound aria-hidden="true" />
              </div>
              <div
                className="affairs-captcha-preview"
                aria-label="驗證碼預覽，未啟用"
              >
                DEMO
              </div>
            </fieldset>
            <div className="affairs-login-actions">
              <Button
                type="button"
                onClick={() => setPanel(panel === "menu" ? "" : "menu")}
              >
                資訊系統選單(MENU)
              </Button>
              <Button type="submit" disabled>
                <KeyRound /> Login
              </Button>
            </div>
          </form>
          <div id="affairs-login-status" className="affairs-login-status">
            此網站與知識庫管理帳號分開。學生個人資料需由正式校務登入連線提供。
          </div>
          <Button
            className="affairs-open-preview"
            variant="outline"
            onClick={() => {
              openAffairsPreview();
              setPreview(true);
              navigate("/school-affairs", { replace: true });
            }}
          >
            瀏覽示範校務介面
          </Button>
          <ol className="affairs-login-notes">
            <li>開放教職員及具學籍身分學生登入系統</li>
            <li>使用預設密碼登入系統後，系統自動導至密碼變更程式</li>
            <li>
              輸入欄位值<span>不可使用空白字元</span>，降低系統遭受攻擊風險
            </li>
          </ol>
          <div className="affairs-login-help">
            <Button
              variant="link"
              onClick={() => setPanel(panel === "help" ? "" : "help")}
            >
              登入說明
            </Button>
            <Button
              variant="link"
              onClick={() => setPanel(panel === "password" ? "" : "password")}
            >
              忘記密碼？
            </Button>
          </div>
          {panel && (
            <section className="affairs-login-information" aria-live="polite">
              <h2>
                {panel === "menu"
                  ? "資訊服務選單"
                  : panel === "password"
                    ? "忘記密碼"
                    : "登入說明"}
              </h2>
              {panel === "menu" ? (
                <>
                  <Link to="/在校學生/">在校學生服務目錄</Link>
                  <a
                    href="https://www.stu.edu.tw/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    學校首頁（官方網站）
                  </a>
                </>
              ) : (
                <>
                  <p>
                    本頁不驗證校方密碼。請到正式校務系統查看登入或帳號復原說明。
                  </p>
                  <a href={base + "login.asp"} target="_blank" rel="noreferrer">
                    開啟正式校務登入
                  </a>
                </>
              )}
            </section>
          )}
        </section>
        <footer>Copyright ©2026 樹德科技大學 · 非官方介面預覽</footer>
      </div>
    </main>
  );
}
