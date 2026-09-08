/**
 * Browser-side logo cleanup for the partner logo upload.
 *
 * Everything runs on a <canvas> in the user's browser — no server, no paid API.
 *   removeBackground  → makes the flat background transparent (edge-connected only,
 *                       so white inside letters survives)
 *   makeWhite         → turns every visible pixel white (for dark logos on the dark header)
 *   trimTransparent   → crops to the visible content
 */

const MAX_SIDE = 1600;

/** Load a File into an <img> */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

/** Draw an image to a fresh canvas (long side capped so processing stays fast) */
export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Copy a canvas so each processing step starts from the original */
export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

/** True if any pixel is not fully opaque */
export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * Make the background transparent.
 * Samples the four corners for the background color, then flood-fills inward from
 * every edge pixel through "background-like" pixels. Enclosed areas (inside an O)
 * are never reached, so they stay. `tolerance` 0–100.
 */
export function removeBackground(canvas: HTMLCanvasElement, tolerance: number): void {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Background reference colors: average of a 3×3 block at each corner
  const corners = [
    [0, 0],
    [w - 3, 0],
    [0, h - 3],
    [w - 3, h - 3],
  ].map(([x0, y0]) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + 3 && y < h; y++)
      for (let x = x0; x < x0 + 3 && x < w; x++) {
        const i = (y * w + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    return [r / n, g / n, b / n];
  });

  const hard = (tolerance / 100) * 110;       // fully transparent within this distance
  const soft = hard * 1.3;                     // feathered edge beyond it
  const dist = (i: number) => {
    let best = Infinity;
    for (const [cr, cg, cb] of corners) {
      const dr = d[i] - cr, dg = d[i + 1] - cg, db = d[i + 2] - cb;
      const e = Math.sqrt(dr * dr + dg * dg + db * db);
      if (e < best) best = e;
    }
    return best;
  };

  // Flood fill from the edges through background-like pixels
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + (w - 1)); }

  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (d[i + 3] === 0) { pushNeighbors(p); continue; } // already transparent — keep walking
    const e = dist(i);
    if (e <= hard) {
      d[i + 3] = 0;
      pushNeighbors(p);
    } else if (e <= soft) {
      // feather: partial alpha, don't continue through it
      d[i + 3] = Math.round(d[i + 3] * ((e - hard) / (soft - hard)));
    }
  }

  function pushNeighbors(p: number) {
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  ctx.putImageData(img, 0, 0);
}

/** Turn every visible pixel white, keeping its alpha (anti-aliasing survives) */
export function makeWhite(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
  }
  ctx.putImageData(img, 0, 0);
}

/** Crop to the visible content (alpha > 8) with 2px padding */
export function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  if (maxX < 0) return canvas; // fully transparent — leave as is
  const pad = 2;
  const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const sw = Math.min(w, maxX + pad + 1) - sx, sh = Math.min(h, maxY + pad + 1) - sy;
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode PNG"))), "image/png")
  );
}
