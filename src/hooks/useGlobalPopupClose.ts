import { useEffect } from 'react';

export const GLOBAL_POPUP_CLOSE_EVENT = 'crm:close-popups';

export const emitGlobalPopupClose = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GLOBAL_POPUP_CLOSE_EVENT));
};

export const useGlobalPopupClose = (onClose: () => void, enabled = true) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const handler = () => onClose();
    window.addEventListener(GLOBAL_POPUP_CLOSE_EVENT, handler);
    return () => window.removeEventListener(GLOBAL_POPUP_CLOSE_EVENT, handler);
  }, [onClose, enabled]);
};
