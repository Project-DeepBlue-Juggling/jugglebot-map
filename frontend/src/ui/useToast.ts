import { useContext } from 'react';
import { ToastContext, type ToastApi } from './toastContextValue';

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
