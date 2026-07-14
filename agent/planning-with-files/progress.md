# Progress Log

- Checked repository contents and confirmed `research.md` is the only existing project document.
- Read `research.md` and extracted the website direction and AI-support goals.
- Verified the current Vite scaffold command against the official Vite documentation.
- Scaffolded a latest Vite React TypeScript app locally.
- Replaced the starter UI with a Shu-Te University smart campus prototype.
- Added documentation files for understanding, setup, project summary, changelog, and planning state.
- Installed npm dependencies and verified the app with a successful production build.
- Inspected the live `https://www.stu.edu.tw` homepage source in the terminal and refactored the prototype to follow its section order and visual composition more closely.
- Reworked the page again to match the screenshot styling more literally, including the hero overlay, turquoise bands, slanted section edges, title treatment, story blocks, contact band, and footer-style lower section.
- Installed `@supabase/supabase-js`, added the Supabase env variables and browser client, and integrated a live `todos` query panel into the existing page.
- Verified the frontend integration, build, and lint; verified the live query path reaches Supabase but currently fails because `public.todos` is not present in the target schema cache.
