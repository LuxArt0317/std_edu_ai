# Initial course selection

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98) covers the 6-1 workflow. The [university entry](https://info.stu.edu.tw/aca/student/SelectCourse/SelNote.asp) required the active university session. It opened the 115-1 schedule, a separate fee notice and then a browser alert followed by the portal index. The browser tool exposed the alert type and destination. The exact alert wording and open-period selection form remain unverified.

The local entry `/school-affairs/services/6-1` opens the schedule. The first image link opens `/school-affairs/services/6-1/fees`. The second opens a neutral availability dialog. Confirming returns to the portal. Existing private notes are retained at `/school-affairs/services/6-1/notes` and linked from assistant answers about saved notes. The existing account history at `/school-affairs/services/11-1` remains the source for personal selection records.

Migration `20261114090000` stores one dated notice and three separate windows, including original Taipei offsets and bilingual audience and fee fields. The page and assistant read the same validated Supabase result. The notice covers the listed term. Questions about other terms report unavailable evidence. This release does not create an enrollment, reserve a seat, grant eligibility or charge fees. The [university Academic Affairs FAQ](https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/) describes the separate selection phases.

## Verify

```sh
PUBLIC_SITE_ORIGIN=https://stu.best EXPECTED_RELEASE_REVISION="$(curl -fsS https://stu.best/release.json | node -p 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).revision')" node tests/integration/first-selection-ui.mjs
```

The browser uses synthetic authentication and real notice and assistant endpoints. It verifies all three dates, menu navigation, fee text, retry, guest return and narrow screens. It requires Node 24 and Chromium. The default on macOS is installed Google Chrome. Set `CHROME_PATH` for a different binary.
