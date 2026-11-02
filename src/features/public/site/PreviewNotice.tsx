/** This is a separately hosted reconstruction, not the university identity provider. */
export function PreviewNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={"reference-preview-notice" + (compact ? " is-compact" : "")}
      aria-label="網站預覽說明"
    >
      <span>校園網站 · 介面預覽（非官方）</span>
      <span>非校方登入服務，不接收校務密碼。</span>
      <a href="/signin?next=%2Fapp%2Fknowledge">知識庫管理</a>
    </aside>
  );
}
