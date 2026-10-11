"use client";
import { useEffect } from "react";
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a[href]");
      if (link && !window.confirm("Discard unsaved changes to this item?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const select = (event: Event) => {
      if (!window.confirm("Discard unsaved changes to this item?"))
        event.preventDefault();
    };
    document.addEventListener("host:select-item", select);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      document.removeEventListener("host:select-item", select);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
}

export function confirmSelection() {
  return document.dispatchEvent(
    new Event("host:select-item", { cancelable: true }),
  );
}
