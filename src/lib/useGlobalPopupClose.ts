import { useEffect } from 'react';

export function emitGlobalPopupOpen() {
  window.dispatchEvent(new CustomEvent('global-popup-open'));
}

export function emitGlobalPopupClose() {
  window.dispatchEvent(new CustomEvent('global-popup-close'));
}

export function useGlobalPopupClose(callback: () => void) {
  useEffect(() => {
    const handlePopupClose = () => {
      callback();
    };

    window.addEventListener('global-popup-close', handlePopupClose);
    return () => {
      window.removeEventListener('global-popup-close', handlePopupClose);
    };
  }, [callback]);
}