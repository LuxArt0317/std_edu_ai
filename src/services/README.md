# Browser service clients

Browser clients call the public, School Affairs and protected Nexus endpoints. `schoolAffairsAssistant.ts` uses only the isolated School Affairs session. Provider secrets stay on the server.

`researchAssistant.ts` reads bounded SSE progress/result events, accepts the JSON fallback, and passes observed activity to the public chat. `schoolAffairsAssistant.ts` uses the same reader after verifying the isolated Google session.

`schoolAffairsWorkspace.ts` exposes account-scoped subjects, assignments and tuition to the School Affairs and DTM views. Its manager call uses the verified Google session and is separately authorized by the database.
