import { useState, useEffect } from 'react';

const imageCache = new Set<string>();

export const useImagePreloader = (src?: string) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setError(true);
      return;
    }

    if (imageCache.has(src)) {
      setLoaded(true);
      return;
    }

    const img = new Image();
    img.src = src;
    img.onload = () => {
      imageCache.add(src);
      setLoaded(true);
    };
    img.onerror = () => {
      setError(true);
    };

  }, [src]);

  return { loaded, error };
};