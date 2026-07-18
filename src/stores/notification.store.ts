/**
 * notification.store — in-app alerts surfaced by the Copilot / Alerts centre.
 * Client-only state (STATE-2). Toasts still use `sonner`; this store tracks
 * the persistent alert tray and derived unread count.
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
  unreadCount: number;

  push: (
    n: Omit<AppNotification, "read" | "createdAt"> & { createdAt?: string },
  ) => void;
  /** Spec alias for push. */
  addNotification: (
    n: Omit<AppNotification, "read" | "createdAt"> & { createdAt?: string },
  ) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

const recomputeUnread = (items: AppNotification[]) =>
  items.reduce((n, i) => (i.read ? n : n + 1), 0);

export const useNotificationStore = create<NotificationState>((set) => {
  const push = (
    n: Omit<AppNotification, "read" | "createdAt"> & { createdAt?: string },
  ) =>
    set((s) => {
      const items = [
        { ...n, createdAt: n.createdAt ?? new Date().toISOString(), read: false },
        ...s.items,
      ].slice(0, 100);
      return { items, unreadCount: recomputeUnread(items) };
    });

  return {
    items: [],
    unreadCount: 0,

    push,
    addNotification: push,
    markRead: (id) =>
      set((s) => {
        const items = s.items.map((i) =>
          i.id === id ? { ...i, read: true } : i,
        );
        return { items, unreadCount: recomputeUnread(items) };
      }),
    markAllRead: () =>
      set((s) => ({
        items: s.items.map((i) => ({ ...i, read: true })),
        unreadCount: 0,
      })),
    clear: () => set({ items: [], unreadCount: 0 }),
  };
});
