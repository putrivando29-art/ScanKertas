import { Point2D, QuadCorners, orderQuadCorners } from './scannerLogic.ts';

/**
 * Finds the four corners of a sheet of paper in an RGBA image.
 *
 * Paper is bright and nearly colourless, while desks, cloth and hands are
 * darker or more saturated. The image is downscaled, each pixel gets a
 * "paper-likeness" score, Otsu's method splits paper from background, and the
 * largest central blob is reduced to the biggest quadrilateral that fits its
 * convex hull. Returns null when nothing paper-shaped is found, so callers can
 * fall back to manual corners instead of trusting a bad guess.
 */
export function detectDocumentCorners(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): QuadCorners | null {
  if (width < 16 || height < 16) return null;

  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const score = paperScoreMap(rgba, width, height, w, h);

  const threshold = otsuThreshold(score);
  let mask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = score[i] > threshold ? 1 : 0;

  // Opening cuts thin bridges to bright background spots; closing fills ink strokes.
  const r = Math.max(1, Math.round(Math.min(w, h) / 120));
  mask = dilate(erode(mask, w, h, r), w, h, r);
  mask = erode(dilate(mask, w, h, r), w, h, r);

  const blob = pickPaperBlob(mask, w, h);
  if (!blob) return null;

  const hull = convexHull(blob.edgePoints);
  if (hull.length < 4) return null;
  const quad = largestQuad(simplifyHull(hull, 48));
  if (!quad) return null;

  const quadArea = polygonArea(quad);
  if (quadArea < MIN_AREA_FRACTION * w * h) return null;
  // A sheet fills most of its own quadrilateral; a random bright blob does not.
  if (blob.area / quadArea < MIN_FILL_RATIO) return null;
  if (!isReasonableQuad(quad)) return null;

  const refined = refineQuad(quad, score, w, h);
  const finalQuad = refined && isReasonableQuad(refined) ? refined : quad;
  return orderQuadCorners(finalQuad.map((p) => ({ x: p.x / w, y: p.y / h })));
}

const DETECT_MAX_SIDE = 320;
const MIN_AREA_FRACTION = 0.12;
const MIN_FILL_RATIO = 0.8;

function paperScoreMap(
  rgba: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  w: number,
  h: number
): Float32Array {
  const out = new Float32Array(w * h);
  const sx = srcW / w;
  const sy = srcH / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      // Sample a sparse grid inside the block: enough to average, cheap on large photos.
      const stepY = Math.max(1, Math.floor((y1 - y0) / 3));
      const stepX = Math.max(1, Math.floor((x1 - x0) / 3));
      for (let yy = y0; yy < y1; yy += stepY) {
        for (let xx = x0; xx < x1; xx += stepX) {
          const i = (yy * srcW + xx) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      out[y * w + x] = min - 0.9 * (max - min);
    }
  }
  return out;
}

export function otsuThreshold(values: ArrayLike<number>): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < lo) lo = values[i];
    if (values[i] > hi) hi = values[i];
  }
  if (hi - lo < 1e-6) return hi;
  const bins = 256;
  const hist = new Float64Array(bins);
  const span = (hi - lo) / (bins - 1);
  for (let i = 0; i < values.length; i++) hist[Math.round((values[i] - lo) / span)]++;

  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = i;
    }
  }
  return lo + best * span;
}

function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(src, w, h, r, 0);
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(src, w, h, r, 1);
}

// Separable square structuring element: a horizontal pass then a vertical pass.
function morph(src: Uint8Array, w: number, h: number, r: number, hit: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const miss = hit ? 0 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = miss;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        if (src[y * w + xx] === hit) {
          v = hit;
          break;
        }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = miss;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        if (tmp[yy * w + x] === hit) {
          v = hit;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

interface Blob {
  area: number;
  edgePoints: Point2D[];
}

/** Labels connected regions and keeps the large one closest to the centre. */
function pickPaperBlob(mask: Uint8Array, w: number, h: number): Blob | null {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 0;
  let best: { label: number; area: number; score: number } | null = null;
  const cx = w / 2;
  const cy = h / 2;
  const diag = Math.hypot(cx, cy);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    next++;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    while (top > 0) {
      const p = stack[--top];
      const px = p % w;
      const py = (p - px) / w;
      area++;
      sumX += px;
      sumY += py;
      if (px > 0 && mask[p - 1] && !labels[p - 1]) {
        labels[p - 1] = next;
        stack[top++] = p - 1;
      }
      if (px < w - 1 && mask[p + 1] && !labels[p + 1]) {
        labels[p + 1] = next;
        stack[top++] = p + 1;
      }
      if (py > 0 && mask[p - w] && !labels[p - w]) {
        labels[p - w] = next;
        stack[top++] = p - w;
      }
      if (py < h - 1 && mask[p + w] && !labels[p + w]) {
        labels[p + w] = next;
        stack[top++] = p + w;
      }
    }
    const dist = Math.hypot(sumX / area - cx, sumY / area - cy) / diag;
    const score = area * (1 - 0.6 * dist);
    if (!best || score > best.score) best = { label: next, area, score };
  }
  if (!best) return null;

  // Leftmost and rightmost pixel per row are all the convex hull needs.
  const edgePoints: Point2D[] = [];
  for (let y = 0; y < h; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] === best.label) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0) {
      edgePoints.push({ x: left, y: y + 0.5 });
      edgePoints.push({ x: right + 1, y: y + 0.5 });
    }
  }
  return { area: best.area, edgePoints };
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain; returns the hull counter-clockwise without repeats. */
export function convexHull(points: Point2D[]): Point2D[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Drops the hull vertices that contribute the least area until at most `max` remain.
function simplifyHull(hull: Point2D[], max: number): Point2D[] {
  const pts = [...hull];
  while (pts.length > max) {
    let minIdx = 0;
    let minArea = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const a = Math.abs(cross(prev, pts[i], next));
      if (a < minArea) {
        minArea = a;
        minIdx = i;
      }
    }
    pts.splice(minIdx, 1);
  }
  return pts;
}

export function polygonArea(poly: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Largest-area quadrilateral whose corners are vertices of a convex polygon. */
export function largestQuad(poly: Point2D[]): Point2D[] | null {
  const n = poly.length;
  if (n < 4) return null;
  if (n === 4) return poly;
  let best: Point2D[] | null = null;
  let bestArea = -1;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      // For a fixed diagonal i-k the two triangles are independent maximisations.
      let bestJ = -1;
      let areaJ = -1;
      for (let j = i + 1; j < k; j++) {
        const a = Math.abs(cross(poly[i], poly[j], poly[k]));
        if (a > areaJ) {
          areaJ = a;
          bestJ = j;
        }
      }
      let bestL = -1;
      let areaL = -1;
      for (let l = k + 1; l < n + i; l++) {
        const ll = l % n;
        const a = Math.abs(cross(poly[i], poly[k], poly[ll]));
        if (a > areaL) {
          areaL = a;
          bestL = ll;
        }
      }
      if (bestJ < 0 || bestL < 0) continue;
      const total = areaJ + areaL;
      if (total > bestArea) {
        bestArea = total;
        best = [poly[i], poly[bestJ], poly[k], poly[bestL]];
      }
    }
  }
  return best;
}

function isReasonableQuad(q: Point2D[]): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4];
    const b = q[i];
    const c = q[(i + 1) % 4];
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (angle < 45 || angle > 135) return false;
  }
  return true;
}

/**
 * The hull quad overshoots wherever the sheet touches a bright background
 * patch. Each side is re-fitted to the strongest paper-to-background step
 * found along its normal, and the corners become the intersections of the
 * fitted lines.
 */
function refineQuad(quad: Point2D[], score: Float32Array, w: number, h: number): Point2D[] | null {
  const ccw = signedArea(quad) > 0 ? 1 : -1;
  const band = Math.max(4, Math.round(Math.min(w, h) * 0.08));
  const lines: Line[] = [];

  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 4) return null;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    // Inward normal: to the left of the edge direction for a counter-clockwise polygon.
    const nx = -ty * ccw;
    const ny = tx * ccw;

    const pts: Point2D[] = [];
    const samples = 40;
    for (let k = 1; k < samples; k++) {
      const t = k / samples;
      if (t < 0.08 || t > 0.92) continue;
      const bx = a.x + (b.x - a.x) * t;
      const by = a.y + (b.y - a.y) * t;
      let bestStep = 0;
      let bestD = 0;
      for (let d = -band; d <= band; d++) {
        // Averaging a few pixels on each side keeps small dark marks (ink, punched
        // holes) from outscoring the real paper edge.
        let inside = 0;
        let outside = 0;
        for (let o = 1; o <= 3; o++) {
          inside += sampleScore(score, w, h, bx + nx * (d + o), by + ny * (d + o));
          outside += sampleScore(score, w, h, bx + nx * (d - o), by + ny * (d - o));
        }
        const step = (inside - outside) / 3;
        if (step > bestStep) {
          bestStep = step;
          bestD = d;
        }
      }
      if (bestStep <= 12) continue;
      pts.push({ x: bx + nx * bestD, y: by + ny * bestD });
    }
    if (pts.length < 6) return null;
    const line = fitLine(pts);
    if (!line) return null;
    lines.push(line);
  }

  const out: Point2D[] = [];
  for (let i = 0; i < 4; i++) {
    const p = intersect(lines[(i + 3) % 4], lines[i]);
    if (!p || p.x < -0.05 * w || p.x > 1.05 * w || p.y < -0.05 * h || p.y > 1.05 * h) return null;
    out.push(p);
  }
  // A refinement that moves a corner wildly is more likely wrong than the hull.
  for (let i = 0; i < 4; i++) {
    if (Math.hypot(out[i].x - quad[i].x, out[i].y - quad[i].y) > band * 2) return null;
  }
  return out;
}

interface Line {
  // Points p satisfy nx * p.x + ny * p.y = c, with (nx, ny) unit length.
  nx: number;
  ny: number;
  c: number;
}

function signedArea(poly: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function sampleScore(score: Float32Array, w: number, h: number, x: number, y: number): number {
  const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
  return score[yi * w + xi];
}

/** Total least squares fit, refitted once without the worst outliers. */
function fitLine(points: Point2D[]): Line | null {
  let line = fitLineOnce(points);
  if (!line) return null;
  const residuals = points.map((p) => Math.abs(line!.nx * p.x + line!.ny * p.y - line!.c));
  const sorted = [...residuals].sort((a, b) => a - b);
  const cutoff = Math.max(1.5, sorted[Math.floor(sorted.length * 0.6)] * 2.5);
  const kept = points.filter((_, i) => residuals[i] <= cutoff);
  if (kept.length >= 5) line = fitLineOnce(kept) ?? line;
  return line;
}

function fitLineOnce(points: Point2D[]): Line | null {
  const n = points.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Direction of the line is the principal eigenvector; the normal is perpendicular.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

function intersect(l1: Line, l2: Line): Point2D | null {
  const det = l1.nx * l2.ny - l1.ny * l2.nx;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (l1.c * l2.ny - l1.ny * l2.c) / det,
    y: (l1.nx * l2.c - l1.c * l2.nx) / det,
  };
}
