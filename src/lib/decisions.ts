import { toast } from "sonner";
export type Decision = {
  id: number;
  kind: "confirm" | "text";
  message: string;
  initialValue: string;
  resolve: (value: boolean | string | null) => void;
};
const queue: Decision[] = [];
const subscribers = new Set<() => void>();
let nextId = 0;
export const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};
const emit = () => subscribers.forEach((callback) => callback());
export function complete(value: boolean | string | null) {
  const request = queue.shift();
  request?.resolve(value);
  emit();
}
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      id: ++nextId,
      kind: "confirm",
      message,
      initialValue: "",
      resolve: (value) => resolve(value === true),
    });
    emit();
  });
}
export function requestText(
  message: string,
  initialValue = "",
): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({
      id: ++nextId,
      kind: "text",
      message,
      initialValue,
      resolve: (value) => resolve(typeof value === "string" ? value : null),
    });
    emit();
  });
}
export function notifyError(message: unknown) {
  toast.error(String(message));
}
export const currentDecision = () => queue[0] ?? null;
