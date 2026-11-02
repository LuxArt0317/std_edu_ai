# Current client state

Issue #76: sidebar enhancement is published. Runtime 10fa59c62a41b357395e8ff9843001a5b2f97c2a is Ready as Vercel AuwicGEzgDcBVXdLH2ccTsenC1DT; quality workflow 41367511024 succeeded. Desktop supports full navigation ↔ 64px icon rail, hover/focus labels, account menu, Cmd/Ctrl+B and seven-day preference persistence. Mobile retains full labels, direct Escape/focus restoration and the separate desktop preference.

Verified twelve production viewport/theme states across full desktop and focused mobile runs, including navigation/reload persistence and resizing. Zero serious/critical accessibility findings, overflow or app errors in successful checks. The initial mobile resize harness race was corrected with a null-safe wait. 170 API/source tests, 13 units, build/lint/docs/dependency checks pass. Seven live entry paths/26 recursive assets and complete client verification pass; a transient initial backend request timeout passed on retry. No schema/account-policy/provider change. Issue #76 closed. Final release documentation follows this verified runtime.

Canonical auth remains /signin and /signup with /login and /crm compatibility. Public email delivery still uses the user-selected limited Supabase default sender; Issue #75 remains open for a production sender connection.
