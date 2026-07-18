/**
 * notification.store — in-app alerts surfaced by the Copilot / Alerts centre.
 * Toasts still use `sonner`; this store tracks the persistent alert tray.
 */
import { create } from "zustand";

export type NotificationSeverity = "info" | "warn" | "risk" | "critical";

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail?: string;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
  push: (n: Omit<AppNotification, "read" | "createdAt"> & { createdAt?: string }) => void;
  markRead: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  push: (n) =>
    set((s) => ({
      items: [
        { ...n, createdAt: n.createdAt ?? new Date().toISOString(), read: false },
        ...s.items,
      ].slice(0, 100),
    })),
  markRead: (id) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)) })),
  clear: () => set({ items: [] }),
}));
