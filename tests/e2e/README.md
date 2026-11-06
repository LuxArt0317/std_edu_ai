# Browser workflows

`portal.spec.ts` checks Nexus roles, navigation, CRUD, learning, accessibility, and mobile layouts. `connected-assistant.spec.ts` checks public and authenticated assistant boundaries and actions.

Run `npm run build` and then `npm run test:e2e` from the repository root. These tests use the exact client Supabase project and create disposable users and records through `client-fixtures.mjs`. Run one fixture suite at a time; global teardown removes its records. The test needs the ignored client and owner environment files described in [setup](../../docs/operations/SETUP.md).

The copied public pages host the assistant inside a same-origin iframe. Browser assertions must target that frame for chat controls, while the page owns the outer close button. The Nexus history test deliberately delays the selected thread's database read to catch messages disappearing after a quick send. Use Playwright's retrying locators for UI state and keep source-copy checks separate from app-shell checks.
