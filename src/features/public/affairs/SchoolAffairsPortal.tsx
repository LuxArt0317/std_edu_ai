import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { SchoolAccountRecords } from "./SchoolAccountRecords";
import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  CalendarDays,
  List,
  Menu,
  Search,
  Landmark,
  ClipboardList,
  Building,
  Boxes,
  Calculator,
  Layers,
  LogOut,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Home,
  Settings,
  Star,
  Bookmark,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { referenceAsset } from "../site/reference";
import {
  commonPrograms,
  filterPrograms,
  getMenuPrograms,
  kindLabels,
  menuPath,
  portalGroups,
  portalNews,
} from "./model";
import type { PortalProgram } from "./model";
import { loadPreferences, savePreferences } from "./preferences";
import type { PortalPreferences } from "./preferences";
import { serviceDestination } from "./studentServices.js";
import { StudentServiceLinks, StudentServiceWorkspace } from "./StudentServiceWorkspace";
import "./portal.css";

const groupIcons = [
  Menu,
  Landmark,
  ClipboardList,
  Building,
  Boxes,
  Calculator,
  Layers,
];
function PortalWidget({
  title,
  count,
  children,
  common = false,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  common?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className={`portal-widget ${common ? "portal-common-widget" : ""}`}
    >
      <header>
        <h2>
          <List aria-hidden="true" />
          {title}
          {count !== undefined && <span className="portal-count">{count}</span>}
        </h2>
        <Button
          variant="ghost"
          aria-label={`${open ? "收合" : "展開"}${title}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </header>
      <div hidden={!open}>{children}</div>
    </section>
  );
}

export default function SchoolAffairsPortal({user}: {user: User}) {
  const displayName = user.email || "Google account";
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState(() => loadPreferences(user.id));
  const preferences = snapshot.value;
  const storageError = !snapshot.storageAvailable;
  const [routeState, setRouteState] = useState({
    pathname: "",
    expanded: "",
    mobileOpen: false,
    query: "",
    customizing: false,
  });
  const [copyStatus, setCopyStatus] = useState("");
  const lastNewsTrigger = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const route = pathname.replace(/\/$/, "").split("/").slice(2);
  const group =
    route[0] === "search" ? "all" : route[0] === "menu" ? route[1] || "" : "";
  const view = route[0] === "search" ? "all" : route[2] || "";
  const currentRouteState =
    routeState.pathname === pathname
      ? routeState
      : {
          pathname,
          expanded: group === "all" ? "" : group,
          mobileOpen: false,
          query: "",
          customizing: false,
        };
  const { expanded, mobileOpen, query, customizing } = currentRouteState;
  function changeRouteState<K extends keyof typeof currentRouteState>(
    key: K,
    value: (typeof currentRouteState)[K],
  ) {
    setRouteState({ ...currentRouteState, [key]: value });
  }
  const setExpanded = (value: string) => changeRouteState("expanded", value);
  const setMobileOpen = (value: boolean) =>
    changeRouteState("mobileOpen", value);
  const setQuery = (value: string) => changeRouteState("query", value);
  const setCustomizing = (value: boolean) =>
    changeRouteState("customizing", value);
  function setPreferences(
    change: (current: PortalPreferences) => PortalPreferences,
  ) {
    const value = change(preferences);
    setSnapshot({ value, storageAvailable: savePreferences(value, user.id) });
  }
  const validMenu =
    route[0] === "search" ||
    portalGroups.some(
      (g) => g.id === group && g.views.some((v) => v[0] === view),
    );
  const index = route.length === 0;
  const bookmarks = route[0] === "bookmarks";
  const notifications = route[0] === "notifications";
  const servicePage = route[0] === "services";
  const ended = route[0] === "signed-out";
  const article = portalNews.find((news) => news.id === params.get("news"));
  const programs = filterPrograms(
    getMenuPrograms(group, view, preferences.favorites),
    query,
  );
  const selectedGroup = portalGroups.find((g) => g.id === group);
  const selectedLabel =
    selectedGroup?.views.find((v) => v[0] === view)?.[1] || "系統搜尋";
  const listView =
    group === "menu" &&
    ["custom", "common", "course", "graduation"].includes(view);
  useEffect(() => {
    document.title = `${index ? "校務系統入口" : validMenu ? selectedLabel : bookmarks ? "已收藏消息查詢" : notifications ? "通知訊息查詢" : "校務系統"} · stu.best School Affairs`;
  }, [
    pathname,
    group,
    index,
    validMenu,
    selectedLabel,
    bookmarks,
    notifications,
  ]);
  const update = <K extends keyof PortalPreferences>(
    key: K,
    value: PortalPreferences[K],
  ) => setPreferences((p) => ({ ...p, [key]: value }));
  const toggleFavorite = (id: string) =>
    setPreferences((p) => ({
      ...p,
      favorites: p.favorites.includes(id)
        ? p.favorites.filter((x) => x !== id)
        : [...p.favorites, id],
    }));
  const closeArticle = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("news");
        return next;
      },
      { replace: true },
    );
  const openArticle = (id: string, trigger: HTMLElement) => {
    lastNewsTrigger.current = trigger;
    setCopyStatus("");
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("news", id);
      return next;
    });
  };
  function renderProgramLink(program: PortalProgram) {
    return (
      <Link data-program-id={program.id} to={serviceDestination(program)}>
        {program.title}
      </Link>
    );
  }
  function renderNavigation(mobile = false) {
    return (
      <nav
        aria-label={mobile ? "行動版校務選單" : "校務選單"}
        className="portal-navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") setExpanded("");
        }}
      >
        <div className="portal-shortcuts">
          <a
            href="https://infosys.stu.edu.tw/CampusAction/"
            target="_blank"
            rel="noreferrer"
            title="校園活動系統（校方服務）"
            aria-label="校園活動系統（校方服務）"
          >
            <CalendarDays />
          </a>
          <a
            href="https://www.stu.edu.tw/latestnews/"
            target="_blank"
            rel="noreferrer"
            title="校園公告系統（校方服務）"
            aria-label="校園公告系統（校方服務）"
          >
            <List />
          </a>
          <Link
            to={menuPath("menu", "custom")}
            title="自訂選單"
            aria-label="自訂選單"
          >
            <Menu />
          </Link>
          <Link
            to="/school-affairs/search"
            title="系統搜尋"
            aria-label="系統搜尋"
          >
            <Search />
          </Link>
        </div>
        <ul>
          {portalGroups.map((item, idx) => {
            const Icon = groupIcons[idx];
            const isOpen =
              expanded === item.id && (!preferences.collapsed || mobile);
            return (
              <li
                key={item.id}
                className={selectedGroup?.id === item.id ? "is-active" : ""}
                onMouseEnter={() => {
                  if (preferences.hoverMenus && !preferences.collapsed)
                    setExpanded(item.id);
                }}
              >
                <Button
                  variant="ghost"
                  className="portal-group-toggle"
                  aria-expanded={isOpen}
                  aria-controls={`${mobile ? "mobile-" : ""}portal-group-${item.id}`}
                  aria-label={item.label}
                  title={preferences.collapsed ? item.label : undefined}
                  onClick={() => {
                    if (preferences.collapsed && !mobile)
                      update("collapsed", false);
                    setExpanded(isOpen ? "" : item.id);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  <ChevronDown
                    className="portal-group-chevron"
                    aria-hidden="true"
                  />
                </Button>
                <ul
                  id={`${mobile ? "mobile-" : ""}portal-group-${item.id}`}
                  hidden={!isOpen}
                >
                  {item.views.map(([key, label]) => (
                    <li key={key}>
                      <Link
                        to={menuPath(item.id, key)}
                        aria-current={
                          group === item.id && view === key ? "page" : undefined
                        }
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          <li>
            <Link
              className="portal-logout"
              to="/school-affairs/signed-out"
              aria-label="Logout：登出校務系統"
              title="登出校務系統"
            >
              <LogOut aria-hidden="true" />
              <span>Logout</span>
            </Link>
          </li>
        </ul>
        {!mobile && (
          <Button
            variant="ghost"
            className="portal-collapse"
            aria-label={preferences.collapsed ? "展開側邊欄" : "收合側邊欄"}
            onClick={() => update("collapsed", !preferences.collapsed)}
          >
            {preferences.collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </Button>
        )}
      </nav>
    );
  }
  const settingsFields = [
    ["fixedNavbar", "Fixed Navbar"],
    ["fixedSidebar", "Fixed Sidebar"],
    ["fixedBreadcrumbs", "Fixed Breadcrumbs"],
    ["contained", "Inside .container"],
    ["hoverMenus", "Submenu on Hover"],
    ["collapsed", "Compact Sidebar"],
    ["alternateActive", "Alt. Active Item"],
  ] as const;
  const renderNewsRows = (category: "news" | "health") => (
    <ul className="portal-lined-list">
      {portalNews
        .filter((n) => n.category === category)
        .map((news) => (
          <li key={news.id}>
            <Button
              variant="ghost"
              onClick={(event) => openArticle(news.id, event.currentTarget)}
            >
              {news.title}
            </Button>
          </li>
        ))}
    </ul>
  );
  const programRows = programs.reduce<
    Array<{ kind: string; section: string; programs: PortalProgram[] }>
  >((rows, program) => {
    let row = rows.at(-1);
    if (!row || row.kind !== program.kind || row.section !== program.section) {
      row = { kind: program.kind, section: program.section, programs: [] };
      rows.push(row);
    }
    row.programs.push(program);
    return rows;
  }, []);
  const styles = {
    "--portal-font-size": `${preferences.fontSize}px`,
  } as CSSProperties;
  return (
    <div
      className={`affairs-portal ${preferences.contained ? "is-contained" : ""} ${preferences.alternateActive ? "alt-active" : ""}`}
      data-skin={preferences.theme}
      style={styles}
    >
      <a href="#portal-content" className="portal-skip">
        跳至主要內容
      </a>
      <header
        className={`portal-navbar ${preferences.fixedNavbar ? "is-fixed" : ""}`}
      >
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="portal-mobile-toggle"
              aria-label="開啟校務選單"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="affairs-portal affairs-mobile-sheet"
            style={styles}
          >
            <SheetTitle>校務選單</SheetTitle>
            <SheetDescription className="sr-only">
              校務系統的本地介面預覽導覽
            </SheetDescription>
            {renderNavigation(true)}
          </SheetContent>
        </Sheet>
        <Link className="portal-brand" to="/school-affairs">
          <img
            src={referenceAsset(
              "https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg",
            )}
            width="30"
            height="33"
            alt=""
          />
          <span>校務資訊系統</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="portal-user"
              aria-label={`Welcome, ${displayName} 帳號選單`}
            >
              <img
                src={referenceAsset(
                  "https://info.stu.edu.tw/ePortal/assets/images/stuUser.png",
                )}
                width="32"
                height="32"
                alt=""
              />
              <span>
                <small lang="en">Welcome,</small>
                <span>{displayName}</span>
              </span>
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="affairs-account-menu">
            <DropdownMenuLabel>stu.best · Google account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/notifications">個人使用者通知查詢</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/bookmarks">使用者收藏校園公告查詢</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/school-affairs/privacy">Privacy &amp; account information</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/signed-out">Logout（登出）</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div
        className={`portal-shell ${preferences.collapsed ? "is-collapsed" : ""}`}
      >
        <aside
          className={`portal-sidebar ${preferences.fixedSidebar ? "is-fixed" : ""}`}
        >
          {renderNavigation()}
        </aside>
        <div className="portal-workspace">
          <div
            className={`portal-breadcrumbs ${preferences.fixedBreadcrumbs ? "is-fixed" : ""}`}
          >
            <Home aria-hidden="true" />
            <Link to="/school-affairs">Index</Link>
            {!index && (
              <>
                <span aria-hidden="true">›</span>
                <span>
                  {validMenu
                    ? "Menu"
                    : servicePage
                      ? "服務 · Service"
                    : bookmarks
                      ? "已收藏消息查詢"
                      : notifications
                        ? "通知訊息查詢"
                        : "預覽"}
                </span>
              </>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="portal-settings-trigger"
                  aria-label="介面設定"
                >
                  <Settings />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="affairs-settings"
                aria-label="介面設定"
              >
                <h2>Choose Skin</h2>
                <div className="portal-skin-options">
                  {(["blue", "dark", "pink", "light"] as const).map((skin) => (
                    <Button
                      key={skin}
                      type="button"
                      aria-label={`${skin} skin`}
                      aria-pressed={preferences.theme === skin}
                      data-skin={skin}
                      onClick={() => update("theme", skin)}
                    >
                      {skin}
                    </Button>
                  ))}
                </div>
                {settingsFields.map(([key, label], idx) => (
                  <div key={key}>
                    {idx === 4 && (
                      <div className="portal-font-size">
                        <span>Font Size</span>
                        <Button
                          variant="outline"
                          aria-label="+A 放大字體"
                          disabled={preferences.fontSize >= 20}
                          onClick={() =>
                            update(
                              "fontSize",
                              Math.min(20, preferences.fontSize + 1),
                            )
                          }
                        >
                          +A
                        </Button>
                        <Button
                          variant="outline"
                          aria-label="-A 縮小字體"
                          disabled={preferences.fontSize <= 12}
                          onClick={() =>
                            update(
                              "fontSize",
                              Math.max(12, preferences.fontSize - 1),
                            )
                          }
                        >
                          -A
                        </Button>
                        <output aria-label="字體大小">
                          {preferences.fontSize}
                        </output>
                      </div>
                    )}
                    <Label htmlFor={`portal-setting-${key}`}>
                      <Checkbox
                        id={`portal-setting-${key}`}
                        checked={preferences[key]}
                        onCheckedChange={(value) => update(key, value === true)}
                      />
                      {label}
                    </Label>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <main id="portal-content" tabIndex={-1} className="portal-content">
            <p className="portal-demo-note">
              已登入 stu.best。您可在此管理私人紀錄。正式申請及校方紀錄請使用各服務的校方連結。
            </p>
            {storageError && (
              <p className="portal-storage-error" role="alert">
                瀏覽器無法儲存設定；本次操作仍可使用，重新整理後可能重設。
              </p>
            )}
            {index && (
              <div className="portal-index">
                <h1 className="sr-only">校務系統入口</h1>
                <StudentServiceLinks />
                <SchoolAccountRecords userId={user.id} />
                <PortalWidget title="最新消息" count={10}>
                  {renderNewsRows("news")}
                </PortalWidget>
                <PortalWidget title="常用選單" count={6} common>
                  <ul className="portal-lined-list">
                    {commonPrograms.slice(0, 6).map((program, index) => (
                      <li key={index}>{renderProgramLink(program)}</li>
                    ))}
                  </ul>
                </PortalWidget>
                <PortalWidget title="疫情資訊">
                  {renderNewsRows("health")}
                </PortalWidget>
              </div>
            )}
            {validMenu && (
              <>
                <h1 className="sr-only">
                  {selectedGroup?.label || "校務系統"} · {selectedLabel}
                </h1>
                {group === "sao" && <StudentServiceLinks />}
                <div className="portal-search">
                  <label className="sr-only" htmlFor="portal-program-search">
                    系統名稱關鍵字
                  </label>
                  <Input
                    ref={searchRef}
                    id="portal-program-search"
                    type="search"
                    placeholder="輸入系統名稱關鍵字"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <span>查詢程式連結</span>
                  <output aria-live="polite">
                    {query ? `${programs.length} 個結果` : ""}
                  </output>
                </div>
                <header className="portal-table-heading">
                  <h2>
                    <List aria-hidden="true" />
                    {selectedGroup?.label || "系統列表及搜尋"}
                  </h2>
                  {!listView && (
                    <Button
                      variant="ghost"
                      className="portal-customize"
                      aria-pressed={customizing}
                      onClick={() => setCustomizing(!customizing)}
                    >
                      自訂選單設定: <span>{customizing ? "YES" : "NO"}</span>
                    </Button>
                  )}
                </header>
                {programs.length === 0 ? (
                  <div className="portal-empty" role="status">
                    <p>
                      {query
                        ? "找不到符合的系統。"
                        : view === "custom"
                          ? "尚未加入自訂選單。"
                          : "此選單目前沒有可用的系統。"}
                    </p>
                    {view === "custom" && !query ? (
                      <p>
                        到任一系統列表開啟「自訂選單設定」，選取星號即可加入。
                        <Link to={menuPath("aca", "all")}>前往教務系統</Link>
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          searchRef.current?.focus();
                        }}
                      >
                        清除搜尋
                      </Button>
                    )}
                  </div>
                ) : listView ? (
                  <ul className="portal-lined-list portal-menu-list">
                    {programs.map((program, idx) => (
                      <li key={`${program.id}-${idx}`}>
                        {renderProgramLink(program)}
                        {view === "custom" && (
                          <Button
                            variant="ghost"
                            aria-label={`移除自訂選單：${program.title}`}
                            onClick={() => toggleFavorite(program.id)}
                          >
                            <X />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="portal-table-scroll">
                    <table className="portal-program-table">
                      <caption className="sr-only">
                        {selectedLabel}程式列表
                      </caption>
                      <colgroup>
                        <col className="portal-kind-column" />
                        <col className="portal-section-column" />
                        <col />
                      </colgroup>
                      <tbody>
                        {programRows.map((row, idx) => {
                          const first =
                            idx === 0 || programRows[idx - 1].kind !== row.kind;
                          let span = 1;
                          while (
                            idx + span < programRows.length &&
                            programRows[idx + span].kind === row.kind
                          )
                            span++;
                          return (
                            <tr key={`${row.kind}-${row.section}`}>
                              {first && (
                                <th
                                  className="portal-kind"
                                  scope="rowgroup"
                                  rowSpan={span}
                                >
                                  <span>
                                    {kindLabels[row.kind] || row.kind}
                                  </span>
                                </th>
                              )}
                              <th
                                scope="row"
                                className="portal-program-section"
                              >
                                {row.section}
                              </th>
                              <td>
                                {row.programs.map((program) => (
                                  <span
                                    className="portal-program"
                                    key={program.id}
                                  >
                                    {renderProgramLink(program)}
                                    {customizing && (
                                      <Button
                                        variant="ghost"
                                        aria-label={`${preferences.favorites.includes(program.id) ? "移除" : "加入"}自訂選單：${program.title}`}
                                        aria-pressed={preferences.favorites.includes(
                                          program.id,
                                        )}
                                        onClick={() =>
                                          toggleFavorite(program.id)
                                        }
                                      >
                                        <Star
                                          fill={
                                            preferences.favorites.includes(
                                              program.id,
                                            )
                                              ? "currentColor"
                                              : "none"
                                          }
                                        />
                                      </Button>
                                    )}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {(bookmarks || notifications) && (
              <>
                <h1 className="portal-page-title">
                  {bookmarks ? "已收藏消息查詢" : "通知訊息查詢"}
                </h1>
                <p className="portal-local-note">
                  此瀏覽器中此帳號的收藏；不讀取或修改校方帳號。
                </p>
                {bookmarks ? (
                  <ul className="portal-lined-list">
                    {portalNews
                      .filter((n) => preferences.bookmarks.includes(n.id))
                      .map((news) => (
                        <li key={news.id}>
                          <Button
                            variant="ghost"
                            onClick={(event) =>
                              openArticle(news.id, event.currentTarget)
                            }
                          >
                            {news.title}
                          </Button>
                        </li>
                      ))}
                    {preferences.bookmarks.length === 0 && (
                      <li>尚未收藏消息。可在公告視窗按下收藏圖示。</li>
                    )}
                  </ul>
                ) : (
                  <ul className="portal-lined-list">
                    <li>歡迎使用校務系統介面預覽。</li>
                    <li>範例費用、帳號與收藏皆不是校方紀錄。</li>
                    <li>原始系統連結會另開分頁；請使用校方提供的帳號登入。</li>
                    <li>
                      <Link to="/school-affairs">返回 Index</Link>
                    </li>
                  </ul>
                )}
              </>
            )}
            {ended && (
              <section className="portal-ended">
                <h1>已離開校務介面預覽</h1>
                <p>這只會離開本地展示，不會登出校方帳號或 STU Nexus。</p>
                <Link to="/school-affairs">返回校務介面預覽</Link>
                <Link to="/在校學生/">返回在校學生</Link>
              </section>
            )}
            {servicePage && <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey={route[1] || ""} view={route.slice(2).join("/")} />}
            {!index && !validMenu && !bookmarks && !notifications && !ended && !servicePage && (
              <section className="portal-ended">
                <h1>找不到選單</h1>
                <Link to="/school-affairs">返回 Index</Link>
              </section>
            )}
          </main>
          <footer className="portal-footer">
            stu.best School Affairs <span>· Independent campus website</span>
          </footer>
        </div>
      </div>
      <Dialog
        open={Boolean(article)}
        onOpenChange={(open) => {
          if (!open) closeArticle();
        }}
      >
        <DialogContent
          className="affairs-news-dialog"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastNewsTrigger.current?.isConnected)
              lastNewsTrigger.current.focus();
            else document.getElementById("portal-content")?.focus();
          }}
        >
          <header>
            <DialogTitle>{article?.title}</DialogTitle>
            <DialogDescription>
              來源介面擷取日期：2026/11/02 · 公告內容預覽
            </DialogDescription>
            <DialogClose asChild>
              <Button variant="ghost" aria-label="關閉公告">
                <X />
              </Button>
            </DialogClose>
          </header>
          <article>
            <p>{article?.summary}</p>
            <p>連結</p>
            <a
              href="https://www.stu.edu.tw/latestnews/"
              target="_blank"
              rel="noreferrer"
            >
              校園公告原始網站 ↗
            </a>
            <p className="portal-local-note">
              完整公告、附件及實際發布資訊以校方網站為準。
            </p>
          </article>
          <footer>
            <Button
              variant="ghost"
              aria-label={
                article && preferences.bookmarks.includes(article.id)
                  ? "取消收藏公告"
                  : "收藏公告"
              }
              aria-pressed={Boolean(
                article && preferences.bookmarks.includes(article.id),
              )}
              onClick={() => {
                if (article)
                  update(
                    "bookmarks",
                    preferences.bookmarks.includes(article.id)
                      ? preferences.bookmarks.filter((id) => id !== article.id)
                      : [...preferences.bookmarks, article.id],
                  );
              }}
            >
              <Bookmark
                fill={
                  article && preferences.bookmarks.includes(article.id)
                    ? "currentColor"
                    : "none"
                }
              />
            </Button>
            <span role="status">{copyStatus}</span>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(
                      `/school-affairs?news=${article?.id}`,
                      location.origin,
                    ).href,
                  );
                  setCopyStatus("已複製預覽連結");
                } catch {
                  setCopyStatus("無法存取剪貼簿；可複製網址列的預覽連結。");
                }
              }}
            >
              複製連結
            </Button>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
}
