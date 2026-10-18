export interface Point2D {
  x: number; // Normalized 0.0 to 1.0
  y: number; // Normalized 0.0 to 1.0
}

export interface QuadCorners {
  topLeft: Point2D;
  topRight: Point2D;
  bottomRight: Point2D;
  bottomLeft: Point2D;
}

export type ScanFilterMode = 'putih_bersih' | 'hitam_putih' | 'warna_asli' | 'abu_tajam';

export type PaperSizeOption = 'A4' | 'Otomatis';
export type PdfQualityOption = 'tinggi' | 'sedang' | 'kecil';

export interface ScanEnhancementParams {
  filter: ScanFilterMode;
  brightness: number; // -50 to +50
  contrast: number; // -50 to +50
  sharpness: number; // 0 to 100
  shadowRemoval: number; // 0 to 100
  rotation: number; // 0, 90, 180, 270
  straightenAngle: number; // -15 to +15 degrees
  autoCrop: boolean;
  keepOriginal: boolean;
}

export interface QualityAssessment {
  meanLuminance: number;
  edgeScore: number;
  isTooDark: boolean;
  isBlurry: boolean;
  edgeDetectionConfidence: 'tinggi' | 'sedang' | 'rendah';
  warnings: string[];
}

export interface ScannedPage {
  id: string;
  label: string;
  originalDataUrl: string;
  processedDataUrl: string;
  corners: QuadCorners;
  params: ScanEnhancementParams;
  quality: QualityAssessment;
  width: number;
  height: number;
  createdAt: string;
}

export interface SavedDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  paperSize: PaperSizeOption;
  pdfQuality: PdfQualityOption;
  pages: ScannedPage[];
  fileSizeKb: number;
  storageLocation: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  defaultScanQuality: 'tinggi' | 'sedang' | 'cepat';
  defaultPdfResolution: PdfQualityOption;
  defaultPaperSize: PaperSizeOption;
  storageLocation: string;
  defaultFilePrefix: string;
  autoDetectEdges: boolean;
  autoWhiteBackground: boolean;
}

export const DEFAULT_ENHANCEMENT_PARAMS: ScanEnhancementParams = {
  filter: 'putih_bersih',
  brightness: 0,
  contrast: 15,
  sharpness: 35,
  shadowRemoval: 90,
  rotation: 0,
  straightenAngle: 0,
  autoCrop: true,
  keepOriginal: false,
};

export const DEFAULT_CORNERS: QuadCorners = {
  topLeft: { x: 0.08, y: 0.07 },
  topRight: { x: 0.92, y: 0.09 },
  bottomRight: { x: 0.94, y: 0.93 },
  bottomLeft: { x: 0.06, y: 0.91 },
};

export const FULL_FRAME_CORNERS: QuadCorners = {
  topLeft: { x: 0.0, y: 0.0 },
  topRight: { x: 1.0, y: 0.0 },
  bottomRight: { x: 1.0, y: 1.0 },
  bottomLeft: { x: 0.0, y: 1.0 },
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  defaultScanQuality: 'tinggi',
  defaultPdfResolution: 'tinggi',
  defaultPaperSize: 'A4',
  storageLocation: '/Penyimpanan Internal/Documents/ScanKertas',
  defaultFilePrefix: 'ScanKertas',
  autoDetectEdges: true,
  autoWhiteBackground: true,
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Orders any 4 points into canonical [topLeft, topRight, bottomRight, bottomLeft]
 * so perspective correction remains valid even after manual corner adjustment.
 */
export function orderQuadCorners(points: Point2D[]): QuadCorners {
  if (points.length !== 4) {
    return { ...DEFAULT_CORNERS };
  }
  const clamped = points.map((p) => ({
    x: clamp(p.x, 0.01, 0.99),
    y: clamp(p.y, 0.01, 0.99),
  }));

  // Sort by y first to separate top two and bottom two
  const sortedByY = [...clamped].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    topLeft: topTwo[0],
    topRight: topTwo[1],
    bottomRight: bottomTwo[1],
    bottomLeft: bottomTwo[0],
  };
}

/**
 * Computes rectified output dimensions in pixels from the 4 quad corners.
 */
export function calculateOutputDimensions(
  corners: QuadCorners,
  srcWidth: number,
  srcHeight: number
): { width: number; height: number; aspectRatio: number } {
  const tl = { x: corners.topLeft.x * srcWidth, y: corners.topLeft.y * srcHeight };
  const tr = { x: corners.topRight.x * srcWidth, y: corners.topRight.y * srcHeight };
  const br = { x: corners.bottomRight.x * srcWidth, y: corners.bottomRight.y * srcHeight };
  const bl = { x: corners.bottomLeft.x * srcWidth, y: corners.bottomLeft.y * srcHeight };

  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottomW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

  const width = Math.max(120, Math.round(Math.max(topW, bottomW)));
  const height = Math.max(160, Math.round(Math.max(leftH, rightH)));

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
  };
}

/**
 * Maps normalized target coordinates (u, v) in [0, 1] to source coordinates
 * inside the quadrilateral defined by `corners`.
 */
export function bilinearInterpolateQuad(corners: QuadCorners, u: number, v: number): Point2D {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);

  const topX = corners.topLeft.x * (1 - uu) + corners.topRight.x * uu;
  const topY = corners.topLeft.y * (1 - uu) + corners.topRight.y * uu;

  const bottomX = corners.bottomLeft.x * (1 - uu) + corners.bottomRight.x * uu;
  const bottomY = corners.bottomLeft.y * (1 - uu) + corners.bottomRight.y * uu;

  return {
    x: topX * (1 - vv) + bottomX * vv,
    y: topY * (1 - vv) + bottomY * vv,
  };
}

/**
 * Maps (u, v) in the unit square to the quadrilateral with a true projective
 * transform, so text spacing stays even when the photo was taken at an angle
 * (bilinear interpolation bends straight lines in that case).
 */
export function perspectiveMapQuad(corners: QuadCorners, u: number, v: number): Point2D {
  const { a, b, c, d, e, f, g, h } = squareToQuadCoefficients(corners);
  const den = g * u + h * v + 1;
  return { x: (a * u + b * v + c) / den, y: (d * u + e * v + f) / den };
}

export function squareToQuadCoefficients(corners: QuadCorners) {
  const x0 = corners.topLeft.x;
  const y0 = corners.topLeft.y;
  const x1 = corners.topRight.x;
  const y1 = corners.topRight.y;
  const x2 = corners.bottomRight.x;
  const y2 = corners.bottomRight.y;
  const x3 = corners.bottomLeft.x;
  const y3 = corners.bottomLeft.y;

  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return { a: x1 - x0, b: x3 - x0, c: x0, d: y1 - y0, e: y3 - y0, f: y0, g: 0, h: 0 };
  }
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  };
}

/**
 * Applies brightness/contrast and the document scan filter to one RGB pixel.
 *
 * Expects a pixel whose lighting was already flattened by
 * `normalizeIllumination`, so clean paper sits near 255 and ink keeps its
 * darkness relative to the paper around it. `shadowRemoval` is applied there,
 * not here.
 */
export function applyPixelFilter(
  r: number,
  g: number,
  b: number,
  params: Pick<ScanEnhancementParams, 'filter' | 'brightness' | 'contrast' | 'shadowRemoval' | 'keepOriginal'>
): [number, number, number] {
  if (params.keepOriginal) {
    return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
  }

  let nr = r;
  let ng = g;
  let nb = b;

  // Brightness (-50 to +50 -> -65 to +65 offset)
  const brightnessOffset = (clamp(params.brightness, -50, 50) / 50) * 65;
  nr += brightnessOffset;
  ng += brightnessOffset;
  nb += brightnessOffset;

  // Contrast (-50 to +50)
  const contrastVal = clamp(params.contrast, -50, 50) * 1.8;
  const factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
  nr = factor * (nr - 128) + 128;
  ng = factor * (ng - 128) + 128;
  nb = factor * (nb - 128) + 128;

  nr = clamp(nr, 0, 255);
  ng = clamp(ng, 0, 255);
  nb = clamp(nb, 0, 255);
  const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

  switch (params.filter) {
    case 'putih_bersih': {
      // Darken mid-tones so faint pen and pencil strokes stay readable, keep ink colour,
      // then fade near-paper tones to pure white.
      nr = 255 * Math.pow(nr / 255, INK_GAMMA);
      ng = 255 * Math.pow(ng / 255, INK_GAMMA);
      nb = 255 * Math.pow(nb / 255, INK_GAMMA);
      const white = clamp((lum - PAPER_FADE_START) / (PAPER_FADE_END - PAPER_FADE_START), 0, 1);
      nr = nr * (1 - white) + 255 * white;
      ng = ng * (1 - white) + 255 * white;
      nb = nb * (1 - white) + 255 * white;
      break;
    }
    case 'hitam_putih': {
      // Soft threshold: a short ramp avoids jagged stroke edges.
      const bw =
        lum >= 205 ? 255 : lum <= 150 ? lum * 0.25 : 37.5 + ((lum - 150) / 55) * 217.5;
      nr = bw;
      ng = bw;
      nb = bw;
      break;
    }
    case 'abu_tajam': {
      const darkened = 255 * Math.pow(lum / 255, INK_GAMMA);
      const white = clamp((lum - PAPER_FADE_START) / (PAPER_FADE_END - PAPER_FADE_START), 0, 1);
      const gray = darkened * (1 - white) + 255 * white;
      nr = gray;
      ng = gray;
      nb = gray;
      break;
    }
    case 'warna_asli':
    default:
      break;
  }

  return [
    clamp(Math.round(nr), 0, 255),
    clamp(Math.round(ng), 0, 255),
    clamp(Math.round(nb), 0, 255),
  ];
}

const INK_GAMMA = 2.1;
const PAPER_FADE_START = 212;
const PAPER_FADE_END = 238;

/**
 * Flattens uneven lighting on a document image in place.
 *
 * Paper is the brightest thing in any small neighbourhood, so a grid of local
 * maxima (smoothed) estimates how lit the paper is everywhere, per channel.
 * Dividing by that estimate turns shadows and tinted light into even white
 * while ink stays as dark, relative to its surroundings, as it was. `strength`
 * in [0, 1] blends between the original and the flattened pixel.
 */
export function normalizeIllumination(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number
): void {
  const s = clamp(strength, 0, 1);
  if (s <= 0 || width < 2 || height < 2) return;

  // Cells must be wider than a pen stroke or the "background" becomes ink.
  const cell = Math.max(8, Math.round(Math.min(width, height) / 64));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const grid = new Float32Array(gw * gh * 3);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * cell;
      const y0 = gy * cell;
      const x1 = Math.min(width, x0 + cell);
      const y1 = Math.min(height, y0 + cell);
      // A high percentile rather than the max, so one specular pixel cannot win.
      const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      let count = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * 4;
          hist[0][pixels[i]]++;
          hist[1][pixels[i + 1]]++;
          hist[2][pixels[i + 2]]++;
          count++;
        }
      }
      const target = Math.max(1, Math.floor(count * 0.1));
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        let v = 255;
        for (; v > 0; v--) {
          acc += hist[c][v];
          if (acc >= target) break;
        }
        grid[(gy * gw + gx) * 3 + c] = v;
      }
    }
  }

  // Cells covered entirely by a dark drawing would read as dark paper; a max
  // filter over neighbours followed by a blur keeps the estimate smooth.
  const spread = maxFilterGrid(grid, gw, gh, 1);
  const smooth = blurGrid(spread, gw, gh);

  for (let y = 0; y < height; y++) {
    const gyf = clamp((y + 0.5) / cell - 0.5, 0, gh - 1);
    const gy0 = Math.floor(gyf);
    const gy1 = Math.min(gh - 1, gy0 + 1);
    const ty = gyf - gy0;
    for (let x = 0; x < width; x++) {
      const gxf = clamp((x + 0.5) / cell - 0.5, 0, gw - 1);
      const gx0 = Math.floor(gxf);
      const gx1 = Math.min(gw - 1, gx0 + 1);
      const tx = gxf - gx0;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = smooth[(gy0 * gw + gx0) * 3 + c];
        const b = smooth[(gy0 * gw + gx1) * 3 + c];
        const d = smooth[(gy1 * gw + gx0) * 3 + c];
        const e = smooth[(gy1 * gw + gx1) * 3 + c];
        const bg = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
        const v = pixels[i + c];
        const flat = Math.min(255, (v * 255) / Math.max(bg, 24));
        pixels[i + c] = v * (1 - s) + flat * s;
      }
    }
  }
}

function maxFilterGrid(grid: Float32Array, gw: number, gh: number, r: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      for (let c = 0; c < 3; c++) {
        let m = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= gw) continue;
            m = Math.max(m, grid[(yy * gw + xx) * 3 + c]);
          }
        }
        // Only lift cells that are much darker than their neighbours (likely ink).
        const own = grid[(y * gw + x) * 3 + c];
        out[(y * gw + x) * 3 + c] = own < m * 0.75 ? m * 0.9 : own;
      }
    }
  }
  return out;
}

function blurGrid(grid: Float32Array, gw: number, gh: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= gw) continue;
            sum += grid[(yy * gw + xx) * 3 + c];
            n++;
          }
        }
        out[(y * gw + x) * 3 + c] = sum / n;
      }
    }
  }
  return out;
}

/**
 * Evaluates image luminance and edge contrast to detect blurry, dark, or low-contrast photos.
 */
export function assessImageQuality(
  luminanceSamples: number[],
  edgeVariance: number
): QualityAssessment {
  if (luminanceSamples.length === 0) {
    return {
      meanLuminance: 160,
      edgeScore: 50,
      isTooDark: false,
      isBlurry: false,
      edgeDetectionConfidence: 'sedang',
      warnings: [],
    };
  }

  const sum = luminanceSamples.reduce((acc, v) => acc + v, 0);
  const meanLuminance = Math.round(sum / luminanceSamples.length);
  const edgeScore = Math.round(clamp(edgeVariance, 0, 100));

  const isTooDark = meanLuminance < 75;
  const isBlurry = edgeScore < 22;

  let edgeDetectionConfidence: 'tinggi' | 'sedang' | 'rendah' = 'tinggi';
  if (edgeScore < 20 || isTooDark) {
    edgeDetectionConfidence = 'rendah';
  } else if (edgeScore < 40) {
    edgeDetectionConfidence = 'sedang';
  }

  const warnings: string[] = [];
  if (isTooDark) {
    warnings.push('Foto terlihat agak gelap. Gunakan fitur Kurangi Bayangan atau aktifkan Flash kamera.');
  }
  if (isBlurry) {
    warnings.push('Tulisan terdeteksi kurang tajam. Tingkatkan slider Ketajaman Tulisan atau ambil ulang foto.');
  }
  if (edgeDetectionConfidence === 'rendah') {
    warnings.push('Batas tepi kertas kurang kontras dengan latar. Silakan sesuaikan 4 titik sudut secara manual.');
  }

  return {
    meanLuminance,
    edgeScore,
    isTooDark,
    isBlurry,
    edgeDetectionConfidence,
    warnings,
  };
}

/**
 * Filters and sorts saved documents for "Dokumen Saya".
 */
export function filterAndSortDocuments(
  docs: SavedDocument[],
  searchQuery: string,
  sortBy: 'terbaru' | 'terlama' | 'nama_asc' | 'halaman_desc'
): SavedDocument[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filtered = docs.filter((doc) => {
    if (!normalizedQuery) return true;
    return (
      doc.name.toLowerCase().includes(normalizedQuery) ||
      doc.paperSize.toLowerCase().includes(normalizedQuery)
    );
  });

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'terlama':
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case 'nama_asc':
        return a.name.localeCompare(b.name, 'id');
      case 'halaman_desc':
        return b.pages.length - a.pages.length;
      case 'terbaru':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });
}

/**
 * Generates a clean default document filename with date stamp.
 */
export function formatDefaultFileName(prefix: string, date: Date = new Date()): string {
  const cleanPrefix = (prefix || 'ScanKertas').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${cleanPrefix}_${yyyy}${mm}${dd}_${hh}${min}`;
}
