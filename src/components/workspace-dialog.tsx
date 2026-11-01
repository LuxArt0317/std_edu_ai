import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function WorkspaceDialog({
  title,
  description,
  children,
  onClose,
  immersive = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  immersive?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[90dvh] overflow-y-auto sm:max-w-4xl",
          immersive && "h-[94dvh] w-[96vw] sm:max-w-[1440px]",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ||
              "Review the details below. Changes are saved only when you submit the form."}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
