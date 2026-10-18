import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderQuadCorners,
  calculateOutputDimensions,
  bilinearInterpolateQuad,
  perspectiveMapQuad,
  normalizeIllumination,
  applyPixelFilter,
  assessImageQuality,
  filterAndSortDocuments,
  formatDefaultFileName,
  DEFAULT_ENHANCEMENT_PARAMS,
  type SavedDocument,
} from './scannerLogic.ts';
import { generateMultiPagePdf } from './pdfGenerator.ts';
import { detectDocumentCorners } from './documentDetector.ts';

test('orderQuadCorners sorts scrambled 4 points into canonical TL, TR, BR, BL', () => {
  const scrambled = [
    { x: 0.88, y: 0.91 }, // BR
    { x: 0.12, y: 0.09 }, // TL
    { x: 0.11, y: 0.89 }, // BL
    { x: 0.89, y: 0.11 }, // TR
  ];
  const ordered = orderQuadCorners(scrambled);
  assert.deepEqual(ordered.topLeft, { x: 0.12, y: 0.09 });
  assert.deepEqual(ordered.topRight, { x: 0.89, y: 0.11 });
  assert.deepEqual(ordered.bottomRight, { x: 0.88, y: 0.91 });
  assert.deepEqual(ordered.bottomLeft, { x: 0.11, y: 0.89 });
});

test('calculateOutputDimensions computes realistic document width, height, and aspect ratio', () => {
  const corners = {
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.9, y: 0.9 },
    bottomLeft: { x: 0.1, y: 0.9 },
  };
  const dims = calculateOutputDimensions(corners, 1000, 1400);
  assert.equal(dims.width, 800);
  assert.equal(dims.height, 1120);
  assert.equal(dims.aspectRatio, Number((800 / 1120).toFixed(4)));
});

test('bilinearInterpolateQuad maps normalized (u, v) to exact quad corners and center', () => {
  const corners = {
    topLeft: { x: 0.1, y: 0.2 },
    topRight: { x: 0.9, y: 0.2 },
    bottomRight: { x: 0.9, y: 0.8 },
    bottomLeft: { x: 0.1, y: 0.8 },
  };
  const tl = bilinearInterpolateQuad(corners, 0, 0);
  const br = bilinearInterpolateQuad(corners, 1, 1);
  const center = bilinearInterpolateQuad(corners, 0.5, 0.5);

  assert.ok(Math.abs(tl.x - 0.1) < 1e-6 && Math.abs(tl.y - 0.2) < 1e-6);
  assert.ok(Math.abs(br.x - 0.9) < 1e-6 && Math.abs(br.y - 0.8) < 1e-6);
  assert.ok(Math.abs(center.x - 0.5) < 1e-6 && Math.abs(center.y - 0.5) < 1e-6);
});

test('applyPixelFilter turns flattened paper white and keeps faint ink visible in putih_bersih mode', () => {
  const params = { ...DEFAULT_ENHANCEMENT_PARAMS, filter: 'putih_bersih' as const };
  assert.deepEqual(applyPixelFilter(240, 238, 236, params), [255, 255, 255]);

  // Dark ink gets darker.
  const [ir, ig, ib] = applyPixelFilter(45, 45, 50, params);
  assert.ok(ir < 40 && ig < 40 && ib < 40);

  // A faint pencil stroke must stay clearly darker than the paper instead of vanishing.
  const [fr, fg, fb] = applyPixelFilter(170, 170, 170, params);
  assert.ok(fr < 150 && fg < 150 && fb < 150, `faint stroke became ${fr},${fg},${fb}`);

  // Blue ink keeps its hue.
  const [br, , bb] = applyPixelFilter(60, 80, 170, params);
  assert.ok(bb > br + 40);
});

test('normalizeIllumination removes a shadow but keeps ink darker than paper', () => {
  const w = 200;
  const h = 200;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Paper fades from 235 (lit) to 120 (shadowed) left to right.
      const paper = 235 - (x / (w - 1)) * 115;
      const ink = y % 20 === 10 && x % 50 < 30;
      const v = ink ? paper * 0.45 : paper;
      const i = (y * w + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  normalizeIllumination(px, w, h, 1);
  const at = (x: number, y: number) => px[(y * w + x) * 4];
  // Paper in the lit and the shadowed half ends up equally bright.
  assert.ok(at(10, 3) > 225 && at(190, 3) > 225, `paper ${at(10, 3)} / ${at(190, 3)}`);
  // Ink in the shadow is still clearly ink.
  assert.ok(at(160, 10) < 150, `ink in shadow ${at(160, 10)}`);
});

test('perspectiveMapQuad hits the corners and keeps straight lines straight', () => {
  const corners = {
    topLeft: { x: 0.2, y: 0.1 },
    topRight: { x: 0.8, y: 0.15 },
    bottomRight: { x: 0.95, y: 0.9 },
    bottomLeft: { x: 0.05, y: 0.85 },
  };
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
  assert.ok(near(perspectiveMapQuad(corners, 0, 0), corners.topLeft));
  assert.ok(near(perspectiveMapQuad(corners, 1, 0), corners.topRight));
  assert.ok(near(perspectiveMapQuad(corners, 1, 1), corners.bottomRight));
  assert.ok(near(perspectiveMapQuad(corners, 0, 1), corners.bottomLeft));

  // Points along the diagonal u = v of the square must be collinear in the photo.
  const p0 = perspectiveMapQuad(corners, 0, 0);
  const p1 = perspectiveMapQuad(corners, 0.3, 0.3);
  const p2 = perspectiveMapQuad(corners, 1, 1);
  const crossZ = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  assert.ok(Math.abs(crossZ) < 1e-9);
});

function renderSyntheticPhoto(
  w: number,
  h: number,
  quad: { x: number; y: number }[] | null,
  options: { paleTouch?: boolean; tintedShadow?: boolean } = {}
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  const inside = (x: number, y: number) => {
    if (!quad) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      const sgn = Math.sign(c);
      if (sgn === 0) continue;
      if (sign === 0) sign = sgn;
      else if (sgn !== sign) return false;
    }
    return true;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Patterned, colourful cloth like the user's photo.
      const checker = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0;
      let r = checker ? 70 : 200;
      let g = checker ? 150 : 90;
      let b = checker ? 80 : 140;
      // A pale, cream patch of cloth touching the sheet's top-left corner.
      if (options.paleTouch && Math.hypot(x - w * 0.12, y - h * 0.1) < w * 0.16) {
        r = 228;
        g = 222;
        b = 205;
      }
      if (inside(x, y)) {
        const shaded = x > w * 0.45 && y > h * 0.55; // a hand shadow
        const ink = y % 16 < 2 && x % 40 < 28;
        const v = ink ? 60 : 225;
        r = v;
        g = v - 3;
        b = v - 6;
        if (shaded) {
          // Light bounced off pink cloth tints the shadow.
          r *= options.tintedShadow ? 0.74 : 0.72;
          g *= options.tintedShadow ? 0.58 : 0.72;
          b *= options.tintedShadow ? 0.64 : 0.72;
        }
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

test('detectDocumentCorners finds a tilted, partly shadowed sheet on patterned cloth', () => {
  const w = 400;
  const h = 520;
  const quad = [
    { x: 92, y: 70 },
    { x: 318, y: 86 },
    { x: 330, y: 452 },
    { x: 74, y: 440 },
  ];
  const found = detectDocumentCorners(renderSyntheticPhoto(w, h, quad), w, h);
  assert.ok(found, 'paper not detected');
  const got = [found.topLeft, found.topRight, found.bottomRight, found.bottomLeft];
  got.forEach((p, i) => {
    const err = Math.hypot(p.x * w - quad[i].x, p.y * h - quad[i].y);
    assert.ok(err < 10, `corner ${i} off by ${err.toFixed(1)}px`);
  });
});

test('detectDocumentCorners keeps a tinted shadow and ignores pale cloth touching the sheet', () => {
  const w = 400;
  const h = 520;
  const quad = [
    { x: 70, y: 60 },
    { x: 330, y: 70 },
    { x: 338, y: 470 },
    { x: 62, y: 462 },
  ];
  const photo = renderSyntheticPhoto(w, h, quad, { paleTouch: true, tintedShadow: true });
  const found = detectDocumentCorners(photo, w, h);
  assert.ok(found, 'paper not detected');
  const got = [found.topLeft, found.topRight, found.bottomRight, found.bottomLeft];
  got.forEach((p, i) => {
    const err = Math.hypot(p.x * w - quad[i].x, p.y * h - quad[i].y);
    assert.ok(err < 12, `corner ${i} off by ${err.toFixed(1)}px`);
  });
});

test('detectDocumentCorners returns null when there is no sheet in the photo', () => {
  assert.equal(detectDocumentCorners(renderSyntheticPhoto(300, 400, null), 300, 400), null);
});

test('applyPixelFilter produces equal R,G,B channels in hitam_putih mode', () => {
  const [r1, g1, b1] = applyPixelFilter(210, 190, 180, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'hitam_putih',
  });
  assert.equal(r1, 255);
  assert.equal(g1, 255);
  assert.equal(b1, 255);

  const [r2, g2, b2] = applyPixelFilter(30, 40, 50, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'hitam_putih',
  });
  assert.equal(r2, g2);
  assert.equal(g2, b2);
  assert.ok(r2 <= 20);
});

test('assessImageQuality flags dark and blurry captures accurately', () => {
  const darkAndBlurry = assessImageQuality([40, 50, 45, 55], 12);
  assert.equal(darkAndBlurry.isTooDark, true);
  assert.equal(darkAndBlurry.isBlurry, true);
  assert.equal(darkAndBlurry.edgeDetectionConfidence, 'rendah');
  assert.ok(darkAndBlurry.warnings.length >= 2);

  const clearScan = assessImageQuality([180, 195, 210, 175], 68);
  assert.equal(clearScan.isTooDark, false);
  assert.equal(clearScan.isBlurry, false);
  assert.equal(clearScan.edgeDetectionConfidence, 'tinggi');
  assert.equal(clearScan.warnings.length, 0);
});

test('filterAndSortDocuments filters by query and sorts by criteria', () => {
  const sampleDocs: SavedDocument[] = [
    {
      id: '1',
      name: 'Kontrak Sewa Ruko',
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
      paperSize: 'A4',
      pdfQuality: 'tinggi',
      pages: [{} as any, {} as any],
      fileSizeKb: 420,
      storageLocation: '/Internal/ScanKertas',
    },
    {
      id: '2',
      name: ' Nota Pembelian Material',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      paperSize: 'Otomatis',
      pdfQuality: 'sedang',
      pages: [{} as any],
      fileSizeKb: 180,
      storageLocation: '/Internal/ScanKertas',
    },
    {
      id: '3',
      name: 'Arsip Pajak Tahunan',
      createdAt: '2026-10-12T10:00:00Z',
      updatedAt: '2026-10-12T10:00:00Z',
      paperSize: 'A4',
      pdfQuality: 'tinggi',
      pages: [{} as any, {} as any, {} as any],
      fileSizeKb: 640,
      storageLocation: '/Internal/ScanKertas',
    },
  ];

  const byNewest = filterAndSortDocuments(sampleDocs, '', 'terbaru');
  assert.equal(byNewest[0].id, '2');

  const byPages = filterAndSortDocuments(sampleDocs, '', 'halaman_desc');
  assert.equal(byPages[0].id, '3');

  const searched = filterAndSortDocuments(sampleDocs, 'pajak', 'terbaru');
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, '3');
});

test('generateMultiPagePdf builds valid %PDF-1.4 binary with multiple pages', () => {
  // Minimal valid base64 payload representing dummy JPEG bytes
  const dummyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const result = generateMultiPagePdf(
    [
      { jpegDataUrl: dummyJpeg, widthPx: 800, heightPx: 1130 },
      { jpegDataUrl: dummyJpeg, widthPx: 800, heightPx: 1130 },
    ],
    'A4',
    'tinggi'
  );

  assert.equal(result.pageCount, 2);
  assert.ok(result.bytes.length > 200);
  const header = Buffer.from(result.bytes.slice(0, 8)).toString('ascii');
  const trailer = Buffer.from(result.bytes.slice(-10)).toString('ascii');
  assert.ok(header.startsWith('%PDF-1.4'));
  assert.ok(trailer.includes('%%EOF'));
});

test('formatDefaultFileName formats prefix and date cleanly', () => {
  const d = new Date(2026, 9, 18, 14, 5); // Oct 18, 2026 14:05
  const name = formatDefaultFileName('ScanKertas', d);
  assert.equal(name, 'ScanKertas_20261018_1405');
});
