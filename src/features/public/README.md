# Public school website

This folder renders the public site, copied reference pages, School Affairs UI and public assistant. `PublicAssistant.tsx` handles anonymous and School Affairs conversations, source activity and image attachments. Standalone copied school pages host that same assistant in a popover at `/campus-assistant?embed=1`; the copied document stays independent of React and its styles. See [School Affairs behavior](../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).

The assistant shows live server events for actual source/account checks while a question is running, then the validated answer and citations. Private model reasoning is never displayed.

The School Affairs account link leaves the embedded assistant frame and opens the full sign-in page. OAuth must start in that top-level page; an older frame that already contains the login page sends its Google button there before starting authorization.

The [DTM preview](dtm/README.md) shares the verified School Affairs Google session and uses separate account-scoped sample records. The direct homepage embeds `/account-status` to show the signed-in Google account without exposing account data to signed-out visitors.
