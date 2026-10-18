import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderQuadCorners,
  calculateOutputDimensions,
  bilinearInterpolateQuad,
  applyPixelFilter,
  assessImageQuality,
  filterAndSortDocuments,
  formatDefaultFileName,
  DEFAULT_ENHANCEMENT_PARAMS,
  type SavedDocument,
} from './scannerLogic.ts';
import { generateMultiPagePdf } from './pdfGenerator.ts';

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

test('applyPixelFilter whitens paper background and deepens ink in putih_bersih mode', () => {
  // Grayish shadowed paper background (R=200, G=198, B=192) -> should become pure white (255, 255, 255)
  const [wr, wg, wb] = applyPixelFilter(200, 198, 192, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'putih_bersih',
  });
  assert.equal(wr, 255);
  assert.equal(wg, 255);
  assert.equal(wb, 255);

  // Dark ink (R=45, G=45, B=50) -> should become darker high-contrast ink
  const [ir, ig, ib] = applyPixelFilter(45, 45, 50, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'putih_bersih',
  });
  assert.ok(ir < 40 && ig < 40 && ib < 40);
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
