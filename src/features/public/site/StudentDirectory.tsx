import { useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { primaryNavigation } from "../../../data/knowledge";
import { referenceAsset, referenceHref } from "./reference";
import { studentCategories } from "./student-links";

export function StudentDirectory() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="student-site">
      <a className="reference-skip" href="#student-content">
        跳至主要內容
      </a>
      <header className="reference-header">
        <div className="reference-header-inner">
          <Link className="reference-brand" to="/">
            <img
              src={referenceAsset(
                "https://www.stu.edu.tw/wp-content/uploads/2025/10/stulogo500px-150x150.png",
              )}
              width="56"
              height="56"
              alt=""
            />
            <span>
              <strong>樹德科技大學</strong>
              <small>愛上宜學、宜居、宜行、宜樂的山水校園</small>
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="reference-menu-toggle hidden p-1.5 max-[640px]:inline-flex"
            aria-label={menuOpen ? "關閉主選單" : "開啟主選單"}
            aria-expanded={menuOpen}
            aria-controls="student-primary-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
          <nav
            id="student-primary-menu"
            aria-label="主選單"
            className={menuOpen ? "is-open" : ""}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMenuOpen(false);
                document
                  .querySelector<HTMLButtonElement>(".reference-menu-toggle")
                  ?.focus();
              }
            }}
          >
            {primaryNavigation.map((item) => (
              <a
                key={item.label}
                href={
                  item.href.startsWith("#")
                    ? "/" + item.href
                    : referenceHref(item.href)
                }
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <div className="student-title-band">
        <h1>在校學生</h1>
      </div>
      <main id="student-content" className="student-directory" tabIndex={-1}>
        {studentCategories.map((category, index) => (
          <section
            className="student-category"
            key={category.title}
            aria-labelledby={`student-category-${index}`}
          >
            <h2 id={`student-category-${index}`}>{category.title}</h2>
            <ul>
              {category.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {item.href ? (
                    <a
                      href={referenceHref(item.href)}
                      data-original-href={item.href}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span title="原始頁面未提供連結">{item.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <footer className="student-reference-footer">
        <span>© 2025 樹德科技大學</span>
        <span aria-hidden="true"> | </span>
        <Link to="/">回到首頁</Link>
      </footer>
    </div>
  );
}
