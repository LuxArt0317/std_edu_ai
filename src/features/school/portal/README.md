# Nexus portal screens

These components implement the role-scoped school workspace. `routes.ts` maps visible sections; the page modules own their respective records and actions. `VideoGuidesView.tsx` and `videoGuideService.ts` provide protected role guides.

`assistant.tsx` handles authenticated conversations and reviewable actions. Conversation history comes from the caller's protected `chat_messages` rows. Keep message sending disabled until the selected thread's history loads, and never render messages from another selected thread. `AssistantMarkdown.tsx` renders answer text without executing model HTML.

The cross-role browser checks in [tests/e2e](../../../../tests/e2e/README.md) cover the assistant, navigation, CRUD, keyboard behavior and phone layouts.
