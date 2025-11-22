import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const CACHE_NAME = 'img-cache-v1';
const ROOT_DIR = 'TTTCRM/media';

function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

async function nativeGetUri(path: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path });
    // Convert to a URL the WebView can render
    try {
      return Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri) : uri;
    } catch {
      return uri;
    }
  } catch {
    return null;
  }
}

async function nativeEnsureFile(src: string): Promise<string | null> {
  try {
    const fileName = `img_${hash(src)}.bin`;
    const fullPath = `${ROOT_DIR}/${fileName}`;
    try {
      const uri = await nativeGetUri(fullPath);
      if (uri) return uri;
    } catch {}
    const res = await fetch(src, { mode: 'no-cors' as any }).catch(() => fetch(src));
    if (!res || !res.ok) return null;
    const blob = await res.blob();
    const arrayBuf = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
    await Filesystem.writeFile({
      path: fullPath,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    const uri = await nativeGetUri(fullPath);
    return uri;
  } catch {
    return null;
  }
}

async function webGetUrl(src: string): Promise<string | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    let res = await cache.match(src);
    if (!res) {
      res = await fetch(src);
      if (!res || !res.ok) return null;
      try { await cache.put(src, res.clone()); } catch {}
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function getLocalImageUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem')) {
    const uri = await nativeEnsureFile(src);
    if (uri) return uri;
  }
  const objUrl = await webGetUrl(src);
  if (objUrl) return objUrl;
  return null;
}
