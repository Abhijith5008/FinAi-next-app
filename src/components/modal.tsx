"use client";

import { useEffect } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
};

export default function Modal({
  open,
  title,
  children,
  onClose,
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        aria-label="Close modal backdrop"
        className="absolute inset-0 bg-black/60"
        onClick={() => closeOnBackdrop && onClose()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">
            {title ?? "Modal"}
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-900"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
