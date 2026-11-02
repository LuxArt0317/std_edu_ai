import { readFile, writeFile } from "node:fs/promises";
const d = JSON.parse(
  await readFile("artifacts/tutorials/exports/chapters.json"),
);
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const time = (s) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const order = [1, 2, 0, 3, 4, 5];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>STU Nexus · Video guides</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f2;color:#15382e;font:16px Arial,sans-serif}main{max-width:1280px;margin:auto;padding:32px}header{display:flex;justify-content:space-between;gap:20px;align-items:start}h1{font-size:36px;letter-spacing:-1px;margin:10px 0}p{color:#52695e;line-height:1.5}a{color:#12664e}video{width:100%;aspect-ratio:16/9;background:#15382e;border-radius:10px}#viewer{margin:24px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{border:1px solid #cddfd3;border-radius:10px;background:white;padding:20px}h2{font-size:20px;margin:12px 0}button,.button{border:0;border-radius:6px;padding:10px 16px;background:#14765e;color:white;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}.secondary{background:#e4eee6;color:#15382e}small{color:#52695e}.actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:18px}footer{border-top:1px solid #cddfd3;margin-top:30px;padding:20px 0;color:#52695e;font-size:14px}@media(max-width:800px){main{padding:18px}.grid{grid-template-columns:1fr}header{display:block}h1{font-size:28px}}</style><main><header><div><small>STU NEXUS / PRACTICAL VIDEO GUIDES</small><h1>Start with your role.</h1><p>Teacher and student walkthroughs first. Six chapters cover every platform role, with live app demonstrations, narrated graphics and English captions.</p></div><a class="button secondary" href="00-complete-walkthrough.mp4" download>Download full walkthrough · ${time(d.seconds)}</a></header><section id="viewer"><h2 id="now">Complete walkthrough</h2><video id="player" controls preload="metadata" src="00-complete-walkthrough.mp4"><track id="captions" kind="captions" src="00-complete-walkthrough.vtt" srclang="en" label="English"></video><p id="detail">Six chapters · demonstrations use synthetic records. Captions are burned in; separate SRT files are also included.</p></section><section class="grid" aria-label="Role chapters">${order
  .map((i) => {
    const c = d.chapters[i];
    return `<article class="card"><small>${String(i + 1).padStart(2, "0")} / ${time(c.duration)}</small><h2>${esc(c.title)}</h2><p>${esc(c.audience)}</p><div class="actions"><button type="button" data-file="${esc(c.file)}" data-title="${esc(c.title)}" data-audience="${esc(c.audience)}">Watch</button><a href="${esc(c.file)}" download>MP4</a><a href="${esc(c.file.replace(".mp4", ".srt"))}" download>Captions</a></div></article>`;
  })
  .join(
    "",
  )}</section><footer>These are demonstrations, not institutional records or a claim of measured time savings. Important AI-assisted changes require human review. <a href="STU-Nexus-Video-Guides.zip" download>Download all videos</a> · <a href="STU-Nexus-Editable-Media.zip" download>Editable source and assets</a> · <a href="CHAPTERS.txt">Chapter timestamps</a> · <a href="00-complete-walkthrough.srt" download>Full captions</a></footer></main><script>const player=document.querySelector('#player');document.querySelectorAll('[data-file]').forEach(b=>b.addEventListener('click',()=>{player.src=b.dataset.file;document.querySelector('#captions').src=b.dataset.file.replace('.mp4','.vtt');document.querySelector('#now').textContent=b.dataset.title;document.querySelector('#detail').textContent=b.dataset.audience+' · Live demonstration and English captions';document.querySelector('#viewer').scrollIntoView({behavior:'smooth'});player.play().catch(()=>{document.querySelector('#detail').textContent+=' · Press Play to begin.'})}));</script></html>`;
await writeFile("artifacts/tutorials/exports/index.html", html);
console.log(JSON.stringify({ gallery: true, chapters: d.chapters.length }));
