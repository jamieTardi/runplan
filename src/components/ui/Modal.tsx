"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40"
          style={{ background: "rgba(2,6,23,0.55)", backdropFilter: "blur(2px)" }}
        />
        <Dialog.Content
          className="fixed z-50 left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 card p-5 fade-in max-h-[90dvh] overflow-y-auto"
          aria-describedby={description ? undefined : ""}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="inline-flex items-center justify-center rounded-lg h-8 w-8 shrink-0"
              style={{ border: "1px solid var(--border-strong)", color: "var(--muted)" }}
              aria-label="Close"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
