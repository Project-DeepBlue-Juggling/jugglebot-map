import { createContext } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

/**
 * Optional inline action on a toast (ADR 0018). When set, the toast renders
 * the action label as a button next to the dismiss control. Clicking the
 * button runs `handler` and immediately dismisses the toast, so a double-
 * click cannot fire the inverse twice. The handler is responsible for any
 * follow-up toasts (success / error after the inverse mutation lands).
 */
export interface ToastAction {
  label: string;
  handler: () => void | Promise<void>;
}

export interface ToastOptions {
  /** Inline action button — typically "Undo" for destructive operations. */
  action?: ToastAction;
  /** Auto-dismiss timeout in ms. Default 5 000; or 10 000 when `action` is set. */
  timeoutMs?: number;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message: string | undefined;
  action: ToastAction | undefined;
  timeoutMs: number | undefined;
}

export interface ToastApi {
  show: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string, options?: ToastOptions) => void;
  error: (title: string, message?: string, options?: ToastOptions) => void;
  info: (title: string, message?: string, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);
