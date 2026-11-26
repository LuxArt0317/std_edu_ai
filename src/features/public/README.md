# Public school website

## Persistent campus assistant

`PublicSite` always mounts the campus assistant launcher, including signed-in DTM and School Affairs/native service routes. Existing account-menu triggers still work. `PublicAssistant` supports separate conversations, source/verification activity, expandable record tables, image input, and reviewed actions. `useAssistantSessions` serializes saves, prevents stale overwrites, isolates account changes and exposes retry/reload/delete controls. Restored actions cannot replay. No private chain-of-thought is displayed.


This folder renders the public site, copied reference pages, School Affairs UI and public assistant. `PublicAssistant.tsx` handles anonymous and School Affairs conversations, source activity and image attachments. Standalone copied school pages host that same assistant in a popover at `/campus-assistant?embed=1`; the copied document stays independent of React and its styles. See [School Affairs behavior](../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).

The assistant attaches live source/account checks to the answer that used them. Users can expand an activity timeline after completion or failure and follow the cited sources. A bounded transcript survives navigation and refresh in the same tab; it is isolated by School Affairs Google identity and cleared on sign-out or New chat. Image bytes, auth tokens, feedback capabilities and unconfirmed actions are not persisted. Private model reasoning is never displayed.

The chat review card shows the exact topic and details for a local learning support submission. Confirmation uses the same native receipt as the [Learning Support workspace](../../../docs/qa/LEARNING_SUPPORT.md).

The School Affairs account link leaves the embedded assistant frame and opens the full sign-in page. OAuth must start in that top-level page; an older frame that already contains the login page sends its Google button there before starting authorization.

DTM and School Affairs share a verified Google session for private student records. The direct homepage embeds `/account-status` to show the signed-in account. [DTM](dtm/README.md), [School Affairs](affairs/README.md).

`useAssistantSessions` isolates account and conversation saves, preserves unsaved work after failures, and prevents late responses from another account from restoring private content. `PublicAssistant` displays unsaved state; a failed old conversation does not block a new one.

The session hook checks the saved ID, title, version and sanitized messages before reporting an account save. Deleting a signed-in chat sends an owner-bound delete even when the browser has no save receipt.

The assistant labels unconfirmed replies “Not confirmed yet” without repeating a check count next to the message. Full verification attempts and tool activity remain available in the saved Activity details.

Verified attachment descriptions use the “Checked against your image” label. Their sources are current-message image inputs, not school records. Images are still not persisted in conversation history.

Chat language preferences control the assistant title, starter questions and feedback form, including help labels, category options and save messages. In English mode, stale Chinese suggested questions are omitted rather than displayed as English. Existing source titles and account record values are not translated into invented facts.

`AssistantActivity.tsx` exports the campus assistant Activity timeline for both the public chat and the standalone local Answer Lab. Both surfaces render the same persisted tool/search/check events; this is an activity record, not private model reasoning.

## Shared assistant message UI
`AssistantChatMessage.tsx` and its CSS own the live message presentation (Markdown, attachments, record views, verification, activity, citations and action reviews). `PublicAssistant` supplies authenticated callbacks; Answer Lab reuses the renderer read-only inside a style-isolated shadow root. Keep message rendering changes in this component instead of creating a second lab renderer.

`AssistantCommands.tsx` supplies slash-command menus, keyboard selection, local preference persistence and thinking/model controls to the shared public/account chatbot. The shared message renderer shows saved settings per answer, rather than relabelling old messages with the current choice.

The assistant header displays the verified account email and a direct Sign out control, or an explicit Signed out link. Signing out cancels active requests/actions and changes the conversation scope so private chats are no longer shown. Account versus public mode is visible without opening School Affairs (Issue #107).

## Conversational progress (Issue #112)

Submitting a question immediately creates a short acknowledgment without waiting for the network or model. It is stored separately from final answer content and remains above the activity disclosure and final answer. The single activity line is collapsed by default, stays expanded if the user opens it, and retains the actual reported tool/source checks. Working drafts stay hidden. The shared message renderer gives Answer Lab the same collapsed activity behavior. No new model call or permission is introduced.
