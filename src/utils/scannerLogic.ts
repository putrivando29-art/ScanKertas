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
  brightness: 8,
  contrast: 22,
  sharpness: 45,
  shadowRemoval: 75,
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
 * Applies shadow reduction, brightness/contrast, and document scan filter
 * to a single RGB pixel [0..255].
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

  // 1. Shadow removal: lift warm/gray paper background toward clean white
  const shadowStrength = clamp(params.shadowRemoval, 0, 100) / 100;
  const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

  if (shadowStrength > 0 && lum > 115) {
    // Smoothly push paper background (luminance > 115) toward 255
    const paperRatio = (lum - 115) / (255 - 115);
    const boost = Math.pow(paperRatio, 0.85) * 75 * shadowStrength;
    nr = nr + boost;
    ng = ng + boost;
    nb = nb + boost;
  }

  // 2. Brightness (-50 to +50 -> -75 to +75 offset)
  const brightnessOffset = (clamp(params.brightness, -50, 50) / 50) * 65;
  nr += brightnessOffset;
  ng += brightnessOffset;
  nb += brightnessOffset;

  // 3. Contrast (-50 to +50)
  const contrastVal = clamp(params.contrast, -50, 50) * 1.8;
  const factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
  nr = factor * (nr - 128) + 128;
  ng = factor * (ng - 128) + 128;
  nb = factor * (nb - 128) + 128;

  const postLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

  // 4. Filter Mode
  switch (params.filter) {
    case 'putih_bersih': {
      // Clean white background while retaining crisp dark text & colored ink/stamps
      if (postLum > 168) {
        const whiteBlend = clamp((postLum - 168) / 55, 0, 1);
        nr = nr * (1 - whiteBlend) + 255 * whiteBlend;
        ng = ng * (1 - whiteBlend) + 255 * whiteBlend;
        nb = nb * (1 - whiteBlend) + 255 * whiteBlend;
      } else if (postLum < 110) {
        // Deepen dark text for high legibility
        const inkFactor = 0.72;
        nr *= inkFactor;
        ng *= inkFactor;
        nb *= inkFactor;
      }
      break;
    }
    case 'hitam_putih': {
      // Soft adaptive-like B&W threshold around luminance 152 for crisp text without jagged edges
      const bw = postLum > 158 ? 255 : postLum < 118 ? 12 : Math.round(((postLum - 118) / 40) * 243 + 12);
      nr = bw;
      ng = bw;
      nb = bw;
      break;
    }
    case 'abu_tajam': {
      // High-clarity grayscale
      const gray = postLum > 195 ? 255 : postLum < 80 ? postLum * 0.65 : postLum;
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
