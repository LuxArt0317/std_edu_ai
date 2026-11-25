import { AsyncLocalStorage } from "node:async_hooks";
// Request-scoped overrides come from validated chat settings or the evaluation
// adapter. Concurrent chats never mutate process.env or each other's settings.
const requests = new AsyncLocalStorage();
export function withAssistantModel(settings, work) {
  return requests.run(Object.freeze({ ...settings }), work);
}
export function assistantModelOverride() {
  return requests.getStore()?.model;
}
export function assistantReasoningOverride() {
  return requests.getStore()?.reasoning;
}
