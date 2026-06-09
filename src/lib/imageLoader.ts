/**
 * Loads an image URL into an HTMLImageElement without ever causing canvas taint.
 *
 * Strategy:
 *   1. If the URL is already a data: or blob: URL, just load it directly.
 *   2. Otherwise fetch the bytes ourselves and turn the response into a
 *      blob: URL. Blob URLs are same-origin so the canvas is never tainted,
 *      regardless of what CORS headers the original server returned.
 *   3. As a last-resort fallback, try the classic crossOrigin="anonymous" load.
 *
 * This fixes the case where Pexels (or any third-party CDN) intermittently
 * omits CORS headers and turns the canvas into a tainted canvas, which then
 * makes `toBlob()` and `new VideoFrame(canvas)` throw — leaving the export
 * spinner stuck "loading" forever.
 */
export async function loadImageNoTaint(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;

  // 1. data: / blob: URLs are already safe.
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return loadDirect(url);
  }

  // 2. Fetch as blob → object URL (same-origin, never tainted).
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const objUrl = URL.createObjectURL(blob);
        const img = await loadDirect(objUrl);
        // We intentionally do NOT revoke the object URL here — the HTMLImageElement
        // keeps using it for the lifetime of the canvas draws. The browser frees
        // it when the page unloads.
        if (img) return img;
        URL.revokeObjectURL(objUrl);
      }
    } else {
      console.warn("[loadImageNoTaint] fetch non-ok", res.status, url);
    }
  } catch (err) {
    console.warn("[loadImageNoTaint] fetch failed, will try proxy", err);
  }

  // 3. Fallback: route through our same-origin edge function proxy. This
  //    guarantees a non-tainted canvas even when the upstream CDN omits CORS
  //    headers. We intentionally avoid the classic crossOrigin="anonymous"
  //    fallback because that can succeed visually but still taint the canvas,
  //    breaking toBlob() at export time.
  try {
    const { getFunctionUrl } = await import("@/lib/cloudClient");
    const proxyUrl = `${getFunctionUrl("image-proxy")}?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const objUrl = URL.createObjectURL(blob);
        const img = await loadDirect(objUrl);
        if (img) return img;
        URL.revokeObjectURL(objUrl);
      }
    } else {
      console.warn("[loadImageNoTaint] proxy non-ok", res.status);
    }
  } catch (err) {
    console.warn("[loadImageNoTaint] proxy failed", err);
  }

  return null;
}

function loadDirect(src: string, withCors = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (withCors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}