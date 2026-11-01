import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Retains native form serialization, reset, required, and ChangeEvent contracts. */
export function CheckboxField({
  checked,
  defaultChecked,
  onChange,
  className,
  ref,
  id,
  ...props
}: ComponentProps<"input">) {
  const nativeRef = useRef<HTMLInputElement | null>(null);
  const visibleRef = useRef<HTMLButtonElement | null>(null);
  const [local, setLocal] = useState(Boolean(defaultChecked));
  const value = checked ?? local;
  useEffect(() => {
    const input = nativeRef.current;
    const form = input?.form;
    const reset = () => {
      const next = checked ?? Boolean(defaultChecked);
      setLocal(next);
      queueMicrotask(() => {
        if (input) input.checked = next;
      });
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [checked, defaultChecked]);
  function assignRef(
    node: HTMLInputElement | null,
    external: Ref<HTMLInputElement> | undefined,
  ) {
    nativeRef.current = node;
    if (typeof external === "function") external(node);
    else if (external) external.current = node;
  }
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <Checkbox
        id={id}
        ref={visibleRef}
        checked={value}
        disabled={props.disabled}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-required={props.required}
        className={cn("size-4", className)}
        onCheckedChange={() => nativeRef.current?.click()}
      />
      <input
        {...props}
        type="checkbox"
        ref={(node) => assignRef(node, ref)}
        checked={value}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onInvalid={(event) => {
          event.preventDefault();
          visibleRef.current?.focus();
          props.onInvalid?.(event);
        }}
        onChange={(event) => {
          setLocal(event.target.checked);
          onChange?.(event);
        }}
      />
    </span>
  );
}
