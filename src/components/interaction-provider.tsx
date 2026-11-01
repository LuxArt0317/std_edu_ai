import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  complete,
  subscribe,
  currentDecision,
  type Decision,
} from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function DecisionForm({ request }: { request: Decision }) {
  const [value, setValue] = useState(request.initialValue);
  function submit(event: FormEvent) {
    event.preventDefault();
    complete(request.kind === "confirm" ? true : value);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) complete(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {request.kind === "confirm" ? "Confirm action" : "Provide details"}
          </DialogTitle>
          <DialogDescription>{request.message}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          {request.kind === "text" ? (
            <Label>
              Details
              <Input
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Label>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => complete(null)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {request.kind === "confirm" ? "Confirm" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function InteractionProvider() {
  const request = useSyncExternalStore(subscribe, currentDecision, () => null);
  return request ? <DecisionForm key={request.id} request={request} /> : null;
}
