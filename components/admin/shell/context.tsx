"use client";
import { createContext, useContext } from "react";
import type { Overview } from "@/lib/types";
export type VisitDraft = {
  title: string;
  startsOn: string;
  endsOn: string;
  message: string;
  themeId: string;
  guestIds: string[];
};
export type HostContextValue = {
  overview: Overview;
  reload: () => Promise<Overview>;
  run: (path: string, body?: unknown, method?: string) => Promise<boolean>;
  pending: boolean;
  drafts: Record<string, VisitDraft>;
  setDraft: (id: string, draft: VisitDraft | null) => void;
};
export const HostContext = createContext<HostContextValue | null>(null);
export function useHost() {
  const value = useContext(HostContext);
  if (!value) throw new Error("Host context is missing.");
  return value;
}
