# Browser service clients

Browser clients call the public, School Affairs and protected Nexus endpoints. `schoolAffairsAssistant.ts` uses only the isolated School Affairs session. Provider secrets stay on the server.

`researchAssistant.ts` reads bounded SSE progress/result events, accepts the JSON fallback, and passes observed activity to the public chat. `schoolAffairsAssistant.ts` uses the same reader after verifying the isolated Google session.

`assistantConversation.ts` merges streamed and final activity, retains up to 24 messages in current-tab session storage, and strips images, tokens and transient action capabilities before writing. It discards transcripts when the verified identity changes and marks an interrupted in-flight response clearly on restore.

`schoolAffairsWorkspace.ts` exposes account-scoped subjects, assignments and tuition to the School Affairs and DTM views. Its manager call uses the verified Google session and is separately authorized by the database.
