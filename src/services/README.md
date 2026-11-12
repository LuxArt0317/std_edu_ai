# Browser service clients

Browser clients call the public, School Affairs and protected Nexus endpoints. `schoolAffairsAssistant.ts` uses only the isolated School Affairs session. Provider secrets stay on the server.

`researchAssistant.ts` reads bounded SSE progress/result events, accepts the JSON fallback, and passes observed activity to the public chat. `schoolAffairsAssistant.ts` uses the same reader after verifying the isolated Google session.

`assistantConversation.ts` merges streamed and final activity, retains up to 24 messages in current-tab session storage, and strips images, tokens and transient action capabilities before writing. It discards transcripts when the verified identity changes and marks an interrupted in-flight response clearly on restore.

`schoolAffairsWorkspace.ts` reads account-scoped School Affairs and DTM data and sends student record edits to the audited RPCs. Its manager call uses the verified Google session and is separately authorized by the database.

`scholarship.ts` defines local scholarship periods and application records, Taipei date/window helpers, and unambiguous applicant labels. The existing School Affairs action/manager clients submit versioned requests with stable retry IDs to the dedicated scholarship RPC.
