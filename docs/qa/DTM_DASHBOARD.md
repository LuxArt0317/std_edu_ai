# DTM dashboard layout — Issue #98

## Published built-in block preferences

The November 13 follow-up implements owner-only visibility, region and weight for Important information, Navigation and Contacts. Both dashboard aliases use the same saved layout. Configuration is a full-width page; source titles, CSS classes, navigation rules and default values stay read-only. Contacts was also rechecked: default Left, weight 1, Configure/Hide controls. The source forms were cancelled and normal mode restored without school changes.

The layout has one version per account. Save and Reset use exact retry receipts; Reset writes canonical defaults with a new version, so older tabs cannot overwrite it. Failed reads do not invent a default layout. No course, profile, university record, HTML block or administrator access is added. Equal-weight tie ordering and hidden/right/content presentation are local behavior; they were not experimentally verified on the school site.

Current evidence: the isolated candidate passed 943 API/source tests, 380 unit tests, TypeScript/build/assets, lint (existing repository warnings), handoff checks and dependency audit (0 findings). Independent review passed 33 focused dashboard/layout cases. Synthetic browser checks cover both aliases at 1533/390/320px, save/reload/reset, stale-conflict recovery, exact lost-acknowledgement replay and read failure, with no horizontal overflow, JavaScript errors or external requests. The final desktop configuration heading, form, fields, actions and footer position match the read-only source measurements; footer height differs by less than 0.008 CSS px from rounding. The default dashboard block geometry also remains unchanged. These measurements are specific to the captured viewport and do not establish complete pixel equivalence. Automated accessibility checks still flag the source-matched muted header/footer colors; accessibility acceptance is not claimed.

Migration 230000 passed a five-group rollback preflight at 132 migrations/149 public RLS tables with exact schema/history/fixture/owner restoration and a closed connection, then was applied alone after the exact client plan. A separate live read verified 133 migrations/150 public RLS tables with zero layout rows and zero operation receipts. Actual-JWT local acceptance `ee9374bf` passed all four groups, 52 HTTP calls, 21 browser API calls and 10 unique writes, including save/save, save/reset and parallel duplicate retries; both aliases saved, reloaded, hid/reset blocks and contained at 390/320px. Exact fixture/dependent cleanup, protected-owner preservation and closed connections passed. No model, official-site or file calls occurred. Administrator cross-account denial was checked with read-only SQL role claims, not an owner browser. Production `d82074080003e301bf57e1b41b7b18c2ae250e20` is Vercel Ready `8jcGCNdU5sY5bJEaAUpC8Xzb7uKi`, with the exact public release manifest verified. Deployed actual-JWT run `f4e33674` passed the same four groups, 52 HTTP calls, 21 browser API calls and 10 unique writes with exact cleanup, protected-owner/unrelated/history preservation and closed connections. Public shell checks passed eight routes and 50 assets. GitHub Quality43397459710 attempt 2 passed unchanged after a supplemental-reader 15ms timing test failed on attempt 1; both attempts remain recorded. The first run `f8d2a7c5` remains a raw failure: two harness defects (PostgreSQL Result prototype comparison and incorrectly qualified cleanup identifiers) were corrected with installed-driver regressions. A separate read-only recovery proved zero residue and unchanged owner, preserving the original failed result and ledger. Historical published-layout evidence follows and does not certify this new persistence.

## Previously published layout

Both `/dtm/my` and `/dtm/dashboard` use the same authenticated dashboard branch.
The saved November 13 source measurements at 1533 × 1399 show a profile header,
Important information → Navigation → Contacts sidebar, and an empty 23px white
center block region. Sidebar x20/y235/width344.531 and center
x402.828/y235/width1110.172 are the desktop targets. The profile image has 100px
content within a 102px frame; its heading is 22px/40px and `#999`.
The shared signed-in desktop navbar is 50px high. Its brand uses source
15px/20px/10px padding, a -20px left margin and 20px/20px typography with CSS
weight 200. The language control starts immediately after the brand, with
15px padding, 16.8px/20px text, 173.2734375px width and 50px height. It remains a
functional native select, with the existing compact wrapping layout below 990px.
Local WOFF2 directory/Brotli inspection confirmed the bundled Open Sans is a
static weight-400 face (`OS/2.usWeightClass=400`, no `fvar` table). The CSS requests
the measured weight 200, while the `@font-face` remains truthfully declared 400;
no actual weight-200 font or variable weight range is claimed.
The source center has 10px padding, a 1px `#e3e3e3` border and a
2px/2px/2px shadow at 5% opacity. Source screenshots and measurements remain
private under ignored `artifacts/visual-parity/`.

The local dashboard now selects that block layout independently of saved course
membership. Existing account-scoped courses, including terms outside the source
capture, remain in the expandable navigation and retain their existing URLs.
No course rows or server behavior change. The local Add course action moves to
the existing account menu and opens the reused record editor in a dialog.
The dialog and successful redirect are scoped to the mounted caller;
switching accounts removes the old draft and ignores its late UI callbacks.
The creator supplies an expected caller ID and editor-lifetime cancellation
signal to the existing mutation service. After session lookup, the service
requires that exact user and checks cancellation before the POST. This covers
an account switch while session lookup is pending, not merely after dispatch.
Existing unguarded callers retain their API shape; the server contract is unchanged.
The existing course menu still owns course edit/delete and related record tools.

The root source inspection confirmed that Customize this page enters block
editing, exposes reset/stop controls and block menus, and leaves the center empty
in the observed configuration. Further read-only inspection found:

- Important information offers Configure and Hide; Navigation offers Configure
  only. Add a block offers only HTML.
- Important information's title and CSS class fields are read-only. Its system
  context, default region Left and default weight -1 are static.
- Navigation's trim length is read-only at 50. Dock Yes, category links No,
  right trimming, course-category structure and default weight 0 are static.
- Both blocks' per-page configuration offers Visible Yes/No, region Left
  (`side-pre`), Right (`side-post`) or content, and weights -10 through 10.

Root expanded and read these controls without changing values, cancelled both
configuration forms, and clicked Stop customizing. The normal Customize this
page control was visible afterward, with zero editing controls. No Reset, Hide,
Move, Add or Save action was performed.

At the published400abb0 checkpoint these controls remained unavailable. The new
follow-up above adds built-in layout persistence; arbitrary HTML content and
uninspected Administration/Move controls remain separate gaps.
The observations do not establish complete feature or pixel equivalence, nor do
they imply that all university accounts have empty dashboards. The avatar frame
is sized from the measurement; an unmeasured border color is not invented.

Dashboard-only sidebar styles use the confirmed borderless cards, 5% shadow,
10px/14px/4px content padding, 40px heading area, 10px paragraph bottom margin,
23px navigation row pitch and 21px nested branch indentation. The source HTML
blocks' inner content wrappers add 1px bottom padding. Each sidebar card is
followed by a real 1px skip target; keyboard-visible skip links point to these
focusable targets. These source elements supply the measured block gaps without
fixed card heights. The dashboard navigation heading uses source `#7f8c8d`.
Contact department names and the after-hours note retain the observed emphasis.
The third contact number is copied literally as `07-615800#2505`; this is a
source transcription, not a claim that the number is valid. The dashboard
footer uses the observed `#c3d1d2` background, `#7f8c8d` text, three columns and
separate attribution row. Its left column links the current identity to local
account records and uses the existing logout action; the middle column is empty.
Login information is 11.2px/20px and attribution 9.8px/20px, as measured.
Seven source social glyphs use the verified bundled Font Awesome mappings.
The school-home icon routes locally. Source external destinations are not health
checked, including the retired Google+ reference; no functionality is claimed.
Privacy remains reachable in the existing account menu.

## Verification scope

`tests/unit/dtm-dashboard.test.tsx` exercises the mounted component offline with
synthetic caller-bound responses: both aliases, populated and empty courses,
sidebar order, existing course navigation/edit/delete, account-menu creation,
failed-save retry, cancellation, account changes before and after dispatch,
loading/error recovery, source footer links/logout and scoped styles.
The existing live student-workspace harness uses the relocated menu entry.
It must be run separately by the serialized acceptance owner.

The initial November 13 correction passed 10 dashboard cases and 65 focused DTM
units. Independent review identified the pending-session account-switch gap.
The transport follow-up passed 14 dashboard cases and 69 focused DTM units, including
both old/new session results after a switch, a mismatched caller before context
rerender, and the measured footer's links/logout. Focused app/test/transport
TypeScript, scoped lint, live-harness syntax and owned-file whitespace checks
passed. The final source-detail refinement passed 15 dashboard cases and 70
focused DTM units, including skip-target/contact/footer-typography coverage.
Focused TypeScript and scoped lint passed again; the reviewed transport and
service documentation hashes remained unchanged.
The final shared-header follow-up passed 16 dashboard cases and 71 focused DTM
units, including native language switching and measured desktop style checks.
Focused TypeScript and lint passed; actual header pixel alignment remains a
separate root-rendered acceptance step.
No build or live acceptance is run by this batch.

This batch does not run a browser, database, model or network request. JSDOM
cannot certify pixel geometry or responsive overflow. Root's final rendered
six-state check covered both aliases at 1533/390/320px with zero horizontal
overflow, JavaScript errors or external requests. At desktop, left/main and all
three sidebar cards matched source x/y/width/height exactly. Footer x/y/width
matched; its height differed by -0.0078125px from the source's 124.1953125px,
consistent with subpixel rounding. Private synthetic results are under
`artifacts/visual-parity/dtm-dashboard-final/`. That evidence precedes the final
shared-header adjustment, whose rendered alignment still needs rechecking.
Source customization
remains a separate gap. The dashboard removes the inherited viewport minimum height
but does not invent a fixed footer position. The source heading `#999`, navigation
heading and footer palette have inherited contrast failures; this work does not
claim a full accessibility pass or WCAG conformance.

The older `artifacts/dtm/dashboard-1440.png` and `dashboard-390.png` filenames
actually depict `/dtm` home. They are not dashboard parity evidence.

Run the focused offline suite from the client checkout:

```sh
TSX_DISABLE_CACHE=1 node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/dtm-dashboard.test.tsx
```


Root final header rendering also checked both aliases at1533/390/320 with zero
horizontal overflow, JavaScript errors or external requests. At1533 the header
is exactly1533×50, the brand is x0/y0/525.28125×45 and the language selector
starts at525.28125 with50px height; its width differs0.0078125px by rounding.
The source brand color is#777, language text#3d3d3d and header shadow
0px1px10px rgba(0,0,0,.1); these measured values are preserved. Source-inherited
contrast findings now explicitly include the brand as well as the profile
heading, navigation heading and footer text. These results establish measured
geometry and containment, not full screenshot equivalence, mobile source parity
or WCAG conformance. Ignored evidence:dtm-dashboard-header-final/result.json.

The final isolated DTM/Dorm candidate also passed896 API/source checks,363 units, TypeScript/build/assets, lint, handoff and dependency audit0. These are offline/configured-build gates. The relocated Add course menu through an actual deployed JWT save and persisted reload has not been rerun; the unchanged backend, client caller/cancellation guards and mounted component interactions are covered by focused tests. The broad student-workspace live script also invokes models and is intentionally not used while Issue100 is paused.

Published runtime400abb07df6c2c2e0247a0634e4d338e70f5df0c is Vercel Ready EPE1q3rqFCSJbkcMF9swjiSBfUFX; Quality43388722996 and public8route/50asset checks pass. These deployment checks do not fill the stated live Add course or persistent-customization gaps.
