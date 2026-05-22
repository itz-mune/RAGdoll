/**
 * Toast helper — thin wrapper around sonner so call-sites never import sonner directly.
 * This keeps swapping the underlying library painless.
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

type ToastOptions = ExternalToast;

export const toast = {
  success: (msg: string, opts?: ToastOptions) =>
    sonnerToast.success(msg, opts),

  error: (msg: string, opts?: ToastOptions) =>
    sonnerToast.error(msg, opts),

  info: (msg: string, opts?: ToastOptions) =>
    sonnerToast.info(msg, opts),

  warning: (msg: string, opts?: ToastOptions) =>
    sonnerToast.warning(msg, opts),

  loading: (msg: string, opts?: ToastOptions) =>
    sonnerToast.loading(msg, opts),

  dismiss: (id?: string | number) =>
    sonnerToast.dismiss(id),

  promise: <T,>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) },
  ) => sonnerToast.promise(promise, msgs),
};
