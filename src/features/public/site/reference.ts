import {announcementEmailPath} from "../../../../server/announcementEmailContract.js";
import {studentProfilePath} from "../../../../server/studentProfileContract.js";
import {repairPaths} from "../affairs/facilityRepair.js";
import assets from "./assets.json";
import { localSchoolHref } from "../mirror/paths";

export function referenceAsset(url: string): string {
  return (assets as Record<string, string>)[url] ?? url;
}

/** School links use local routes; third-party destinations remain explicitly external. */
export function referenceHref(href: string): string {
  try {
    const url = new URL(href, "https://www.stu.edu.tw");
    if (
      url.hostname === "info.stu.edu.tw" &&
      ["/", "/eportal/login.asp", "/eportal/index.asp"].includes(
        url.pathname.toLowerCase(),
      )
    )
      return "/school-affairs";
    if (
      ["www.stu.edu.tw", "stu.edu.tw"].includes(url.hostname) &&
      decodeURIComponent(url.pathname).replace(/\/$/, "") === "/在校學生"
    )
      return "/在校學生/";
    if (
      (url.hostname === "mail.google.com" &&
        url.pathname.replace(/\/$/, "") === "/a/stu.edu.tw") ||
      url.hostname === "sso2.stu.edu.tw"
    )
      return "/student-sso";
    if (url.hostname === "info.stu.edu.tw" && url.pathname.toLowerCase() === "/eportal/pg/setnewstomail.asp")
      return announcementEmailPath;
    if (url.hostname === "info.stu.edu.tw" && url.pathname.toLowerCase() === "/aca/student/newstu/mtnstudata.asp")
      return studentProfilePath;
    if (url.hostname === "infosys.stu.edu.tw" &&
      url.pathname.replace(/\/$/, "").toLowerCase() === "/webrpg/login/asplogin/1")
      return repairPaths.report;
    return localSchoolHref(href) || href;
  } catch {
    return href;
  }
}
