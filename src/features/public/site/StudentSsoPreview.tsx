import { Link } from "react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Visual-only copy: disabled fields, no form/action, no school OAuth or password transmission. */
export function StudentSsoPreview() {
  return (
    <main className="student-sso-preview" aria-labelledby="sso-preview-title">
      <div className="sso-reference-clouds" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <section className="sso-reference-card">
        <header>
          <p className="sso-reference-brand">樹德科技大學 mySTU</p>
          <h1 id="sso-preview-title" lang="en">
            Sign in to your account
          </h1>
        </header>
        <fieldset disabled aria-describedby="sso-preview-explanation">
          <legend className="sr-only">School SSO visual preview</legend>
          <label className="sr-only" htmlFor="sso-preview-username">
            Username or email
          </label>
          <Input
            id="sso-preview-username"
            className="h-[38px] rounded-[7px] border-0 bg-[#e4e8ee] text-base text-[#495057] shadow-none placeholder:text-[#586166] disabled:opacity-100 md:text-base"
            placeholder="Username or email"
            autoComplete="off"
            disabled
          />
          <label className="sr-only" htmlFor="sso-preview-password">
            Password
          </label>
          <Input
            id="sso-preview-password"
            className="h-[38px] rounded-[7px] border-0 bg-[#e4e8ee] text-base text-[#495057] shadow-none placeholder:text-[#586166] disabled:opacity-100 md:text-base"
            type="password"
            placeholder="Password"
            autoComplete="off"
            disabled
          />
          <Button
            className="h-9 w-full rounded-[7px] bg-[#5fc2b6] text-[#173d35] shadow-none disabled:opacity-100"
            type="button"
            disabled
            lang="en"
          >
            Sign In
          </Button>
        </fieldset>
      </section>
      <div className="sso-reference-explanation">
        <p id="sso-preview-explanation">
          介面預覽，不接收帳號或密碼。校方登入尚未串接。
        </p>
        <Link to="/在校學生/">返回在校學生</Link>
        <a href="/signin">STU Nexus 登入</a>
      </div>
    </main>
  );
}
