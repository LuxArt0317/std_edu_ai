# Public school website

## Persistent campus assistant

`PublicSite` always mounts the campus assistant launcher, including signed-in DTM and School Affairs/native service routes. Existing account-menu triggers still work. `PublicAssistant` supports separate conversations, source/verification activity, expandable record tables, image input, and reviewed actions. `useAssistantSessions` serializes saves, prevents stale overwrites, isolates account changes and exposes retry/reload/delete controls. Restored actions cannot replay. No private chain-of-thought is displayed.


This folder renders the public site, copied reference pages, School Affairs UI and public assistant. `PublicAssistant.tsx` handles anonymous and School Affairs conversations, source activity and image attachments. Standalone copied school pages host that same assistant in a popover at `/campus-assistant?embed=1`; the copied document stays independent of React and its styles. See [School Affairs behavior](../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).

The assistant attaches live source/account checks to the answer that used them. Users can expand an activity timeline after completion or failure and follow the cited sources. A bounded transcript survives navigation and refresh in the same tab; it is isolated by School Affairs Google identity and cleared on sign-out or New chat. Image bytes, auth tokens, feedback capabilities and unconfirmed actions are not persisted. Private model reasoning is never displayed.

The School Affairs account link leaves the embedded assistant frame and opens the full sign-in page. OAuth must start in that top-level page; an older frame that already contains the login page sends its Google button there before starting authorization.

DTM and School Affairs share a verified Google session for private student records. The direct homepage embeds `/account-status` to show the signed-in account. [DTM](dtm/README.md), [School Affairs](affairs/README.md).

`useAssistantSessions` isolates account and conversation saves, preserves unsaved work after failures, and prevents late responses from another account from restoring private content. `PublicAssistant` displays unsaved state; a failed old conversation does not block a new one.
