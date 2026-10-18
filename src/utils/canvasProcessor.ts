import {
  QuadCorners,
  ScanEnhancementParams,
  QualityAssessment,
  calculateOutputDimensions,
  perspectiveMapQuad,
  applyPixelFilter,
  normalizeIllumination,
  assessImageQuality,
  clamp,
  DEFAULT_ENHANCEMENT_PARAMS,
  SavedDocument,
} from './scannerLogic.ts';
import { detectDocumentCorners } from './documentDetector.ts';

export interface SamplePhotoTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  defaultCorners: QuadCorners;
  lightingCondition: 'normal' | 'bayangan' | 'redup';
  renderType: 'faktur_pajak' | 'surat_kontrak' | 'struk_belanja' | 'catatan_kuliah' | 'form_identitas';
}

export const SAMPLE_GALLERY_TEMPLATES: SamplePhotoTemplate[] = [
  {
    id: 'sample-faktur',
    title: 'Faktur Penjualan PT Nusantara',
    category: 'Tagihan & Invoice',
    description: 'Kertas A4 di atas meja kayu dengan bayangan samping dan kemiringan perspektif.',
    defaultCorners: {
      topLeft: { x: 0.11, y: 0.08 },
      topRight: { x: 0.87, y: 0.06 },
      bottomRight: { x: 0.93, y: 0.92 },
      bottomLeft: { x: 0.07, y: 0.89 },
    },
    lightingCondition: 'bayangan',
    renderType: 'faktur_pajak',
  },
  {
    id: 'sample-kontrak',
    title: 'Surat Perjanjian Kerja Sama',
    category: 'Dokumen Resmi',
    description: 'Dokumen kontrak resmi lengkap dengan tanda tangan basah dan stempel biru.',
    defaultCorners: {
      topLeft: { x: 0.09, y: 0.07 },
      topRight: { x: 0.89, y: 0.10 },
      bottomRight: { x: 0.91, y: 0.93 },
      bottomLeft: { x: 0.08, y: 0.91 },
    },
    lightingCondition: 'normal',
    renderType: 'surat_kontrak',
  },
  {
    id: 'sample-struk',
    title: 'Struk Belanja & Kwitansi Kas',
    category: 'Bukti Transaksi',
    description: 'Kertas termal agak kekuningan dengan teks rapat dan lipatan halus.',
    defaultCorners: {
      topLeft: { x: 0.16, y: 0.09 },
      topRight: { x: 0.84, y: 0.08 },
      bottomRight: { x: 0.86, y: 0.92 },
      bottomLeft: { x: 0.14, y: 0.91 },
    },
    lightingCondition: 'bayangan',
    renderType: 'struk_belanja',
  },
  {
    id: 'sample-catatan',
    title: 'Catatan Rapat & Diagram Teknis',
    category: 'Catatan Tulis',
    description: 'Kertas buku catatan bergaris dengan tulisan pena hitam dan stabilo penanda.',
    defaultCorners: {
      topLeft: { x: 0.10, y: 0.09 },
      topRight: { x: 0.90, y: 0.07 },
      bottomRight: { x: 0.92, y: 0.91 },
      bottomLeft: { x: 0.08, y: 0.93 },
    },
    lightingCondition: 'normal',
    renderType: 'catatan_kuliah',
  },
  {
    id: 'sample-redup',
    title: 'Formulir Pendaftaran (Cahaya Redup)',
    category: 'Uji Cahaya Rendah',
    description: 'Contoh foto dokumen agak gelap untuk menguji fitur Kurangi Bayangan & Peringatan Mutu.',
    defaultCorners: {
      topLeft: { x: 0.12, y: 0.10 },
      topRight: { x: 0.88, y: 0.11 },
      bottomRight: { x: 0.91, y: 0.90 },
      bottomLeft: { x: 0.09, y: 0.92 },
    },
    lightingCondition: 'redup',
    renderType: 'form_identitas',
  },
];

/**
 * Generates a realistic photograph of a physical paper document resting on a desk
 * with perspective skew, realistic paper tone, shadow gradient, and crisp ink details.
 */
export function renderSampleDocumentPhoto(
  template: SamplePhotoTemplate,
  withFlash: boolean = false
): string {
  const canvas = document.createElement('canvas');
  const W = 720;
  const H = 960;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw Desk Surface (dark warm walnut/slate surface so paper edges are distinct)
  const deskGrad = ctx.createLinearGradient(0, 0, W, H);
  if (template.lightingCondition === 'redup' && !withFlash) {
    deskGrad.addColorStop(0, '#1e1b18');
    deskGrad.addColorStop(1, '#12100e');
  } else {
    deskGrad.addColorStop(0, '#3e3229');
    deskGrad.addColorStop(0.5, '#332820');
    deskGrad.addColorStop(1, '#261d17');
  }
  ctx.fillStyle = deskGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle wood grain lines on desk
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 2;
  for (let y = 20; y < H; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.3, y + 12, W * 0.7, y - 10, W, y + 5);
    ctx.stroke();
  }

  // 2. Create offscreen flat document page (600 x 820)
  const docCanvas = document.createElement('canvas');
  const docW = 600;
  const docH = 820;
  docCanvas.width = docW;
  docCanvas.height = docH;
  const dctx = docCanvas.getContext('2d');
  if (dctx) {
    // Realistic slightly warm/shadowed paper base (not pure white yet, so Putih Bersih filter shines!)
    const paperGrad = dctx.createLinearGradient(0, 0, docW, docH);
    if (template.lightingCondition === 'redup' && !withFlash) {
      paperGrad.addColorStop(0, '#b8b4ac');
      paperGrad.addColorStop(0.6, '#9e9a92');
      paperGrad.addColorStop(1, '#85817a');
    } else if (template.lightingCondition === 'bayangan' && !withFlash) {
      paperGrad.addColorStop(0, '#f3efe6');
      paperGrad.addColorStop(0.55, '#e5e0d5');
      paperGrad.addColorStop(1, '#c8c2b6');
    } else {
      paperGrad.addColorStop(0, '#f7f5f0');
      paperGrad.addColorStop(1, '#e4e0d8');
    }
    dctx.fillStyle = paperGrad;
    dctx.fillRect(0, 0, docW, docH);

    // Draw specific document content
    drawTemplateContent(dctx, template.renderType, docW, docH);

    // Diagonal shadow cast across bottom-right of paper if not using flash
    if (!withFlash && template.lightingCondition !== 'normal') {
      const shadowGrad = dctx.createLinearGradient(docW * 0.35, docH * 0.4, docW, docH);
      shadowGrad.addColorStop(0, 'rgba(20, 25, 35, 0)');
      shadowGrad.addColorStop(1, 'rgba(20, 25, 35, 0.22)');
      dctx.fillStyle = shadowGrad;
      dctx.fillRect(0, 0, docW, docH);
    }
  }

  // 3. Project the flat document onto the tilted quad corners on the desk canvas
  // Using scanline strip approximation so it matches `template.defaultCorners` accurately
  const c = template.defaultCorners;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 10;

  ctx.beginPath();
  ctx.moveTo(c.topLeft.x * W, c.topLeft.y * H);
  ctx.lineTo(c.topRight.x * W, c.topRight.y * H);
  ctx.lineTo(c.bottomRight.x * W, c.bottomRight.y * H);
  ctx.lineTo(c.bottomLeft.x * W, c.bottomLeft.y * H);
  ctx.closePath();
  ctx.fillStyle = '#e5e0d5';
  ctx.fill();
  ctx.restore();

  // Render document strips into the quad
  const strips = 80;
  for (let i = 0; i < strips; i++) {
    const v0 = i / strips;
    const v1 = (i + 1) / strips;
    const vm = (v0 + v1) / 2;

    const leftX = (c.topLeft.x * (1 - vm) + c.bottomLeft.x * vm) * W;
    const leftY0 = (c.topLeft.y * (1 - v0) + c.bottomLeft.y * v0) * H;
    const leftY1 = (c.topLeft.y * (1 - v1) + c.bottomLeft.y * v1) * H;

    const rightX = (c.topRight.x * (1 - vm) + c.bottomRight.x * vm) * W;
    const rightY0 = (c.topRight.y * (1 - v0) + c.bottomRight.y * v0) * H;
    const rightY1 = (c.topRight.y * (1 - v1) + c.bottomRight.y * v1) * H;

    const stripW = rightX - leftX;
    const angle = Math.atan2(rightY0 - leftY0, stripW);
    const dist = Math.hypot(stripW, rightY0 - leftY0);
    const stripH = Math.max(leftY1 - leftY0, rightY1 - rightY0) + 1.5;

    ctx.save();
    ctx.translate(leftX, leftY0);
    ctx.rotate(angle);
    ctx.drawImage(
      docCanvas,
      0,
      v0 * docH,
      docW,
      (v1 - v0) * docH,
      0,
      0,
      dist,
      stripH
    );
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

function drawTemplateContent(
  ctx: CanvasRenderingContext2D,
  type: SamplePhotoTemplate['renderType'],
  w: number,
  h: number
) {
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';

  if (type === 'faktur_pajak') {
    // Header brand
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(42, 42, 516, 6);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('PT NUSANTARA LOGISTIK MANDIRI', 42, 82);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Jl. Jenderal Sudirman Kav. 48, Jakarta Selatan · NPWP: 01.348.992.1-012.000', 42, 104);

    // Invoice badge
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#0f766e';
    ctx.fillText('FAKTUR TAGIHAN #INV-2026-0891', 42, 148);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('Tanggal Terbit: 18 Oktober 2026     Jatuh Tempo: 02 November 2026', 42, 170);

    // Table Header
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(42, 200, 516, 32);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('DESKRIPSI LAYANAN / BARANG', 54, 221);
    ctx.fillText('QTY', 340, 221);
    ctx.fillText('HARGA SATUAN', 400, 221);
    ctx.fillText('TOTAL (IDR)', 490, 221);

    const rows = [
      ['Pengiriman Kontainer Rute Surabaya - Makassar', '2 Unit', '14.500.000', '29.000.000'],
      ['Asuransi Kargo Maritim All-Risk', '1 Paket', '2.450.000', '2.450.000'],
      ['Biaya Bongkar Muat Pelabuhan & Dokumen Kepabeanan', '1 Lot', '3.800.000', '3.800.000'],
      ['Sewa Gudang Transit Berpendingin (5 Hari)', '5 Hari', '950.000', '4.750.000'],
    ];

    ctx.font = '13px sans-serif';
    rows.forEach((r, idx) => {
      const y = 260 + idx * 44;
      ctx.fillStyle = '#1e293b';
      ctx.fillText(r[0], 54, y);
      ctx.fillText(r[1], 340, y);
      ctx.fillText(r[2], 400, y);
      ctx.font = 'bold 13px monospace';
      ctx.fillText(r[3], 480, y);
      ctx.font = '13px sans-serif';
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(42, y + 16);
      ctx.lineTo(558, y + 16);
      ctx.stroke();
    });

    // Summary box
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Subtotal:', 360, 465);
    ctx.fillText('Rp 40.000.000', 460, 465);
    ctx.fillText('PPN (11%):', 360, 490);
    ctx.fillText('Rp  4.400.000', 460, 490);
    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('TOTAL TAGIHAN:', 320, 522);
    ctx.fillText('Rp 44.400.000', 455, 522);

    // Stamp & Signature
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(465, 650, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(13, 148, 136, 0.85)';
    ctx.fillText('LUNAS / TERVERIFIKASI', 402, 654);

    // Signature curve
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(410, 670);
    ctx.bezierCurveTo(435, 620, 460, 690, 495, 635);
    ctx.bezierCurveTo(510, 615, 520, 665, 540, 645);
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Hendra Wijaya, S.E.', 415, 720);
    ctx.font = '12px sans-serif';
    ctx.fillText('Direktur Keuangan', 425, 738);
  } else if (type === 'surat_kontrak') {
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('SURAT PERJANJIAN KERJA SAMA KEMITRAAN', 88, 76);
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Nomor: 042/SPK-DIG/X/2026', 195, 102);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 120);
    ctx.lineTo(552, 120);
    ctx.stroke();

    const paragraphs = [
      'Pada hari ini, Minggu tanggal 18 Oktober tahun 2026, yang bertanda tangan',
      'di bawah ini menyatakan kesepakatan kerja sama pengadaan perangkat lunak',
      'digitalisasi arsip dokumen antara Pihak Pertama dan Pihak Kedua.',
      '',
      'PASAL 1 — RUANG LINGKUP PEKERJAAN',
      '1. Pemindaian seluruh dokumen fisik menggunakan standar koreksi perspektif.',
      '2. Pengarsipan dokumen dalam format PDF resolusi tinggi berukuran A4 standar.',
      '3. Penyimpanan data bersifat lokal di perangkat tanpa ketergantungan server luar.',
      '',
      'PASAL 2 — JANGKA WAKTU & PEMBAYARAN',
      'Perjanjian ini berlaku selama 24 (dua puluh empat) bulan kalender sejak',
      'tanggal ditandatangani oleh kedua belah pihak dalam keadaan sadar.',
    ];

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#1e293b';
    paragraphs.forEach((line, i) => {
      if (line.startsWith('PASAL')) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(line, 52, 162 + i * 28);
        ctx.font = '14px sans-serif';
      } else {
        ctx.fillText(line, 52, 162 + i * 28);
      }
    });

    // Signatures
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('PIHAK PERTAMA', 90, 560);
    ctx.fillText('PIHAK KEDUA', 395, 560);

    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(85, 625);
    ctx.bezierCurveTo(115, 580, 145, 650, 185, 600);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(390, 625);
    ctx.bezierCurveTo(420, 585, 455, 645, 495, 605);
    ctx.stroke();

    ctx.fillText('( Ir. Bagus Santoso )', 80, 675);
    ctx.fillText('( Nadia Kusuma, M.Kom )', 375, 675);
  } else if (type === 'struk_belanja') {
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('TOKO BUKU & ATK GRAMEDIA JAYA', 115, 80);
    ctx.font = '13px monospace';
    ctx.fillText('Cabang Menteng Raya No. 18 - Jakarta Pusat', 125, 105);
    ctx.fillText('--------------------------------------------', 100, 130);
    const items = [
      ['Kertas HVS A4 80gr (5 Rim)', 'Rp 275.000'],
      ['Map Ordner Bantex Folio (4 Pcs)', 'Rp 148.000'],
      ['Tinta Printer Hitam Pigmen', 'Rp  95.000'],
      ['Pena Gel Dokumen Tahan Air', 'Rp  42.000'],
      ['Stapler Heavy Duty HD-50', 'Rp  68.000'],
    ];
    items.forEach((it, idx) => {
      const y = 170 + idx * 42;
      ctx.fillText(it[0], 105, y);
      ctx.fillText(it[1], 395, y);
    });
    ctx.fillText('--------------------------------------------', 100, 390);
    ctx.font = 'bold 16px monospace';
    ctx.fillText('TOTAL BAYAR (QRIS)', 105, 425);
    ctx.fillText('Rp 628.000', 385, 425);
    ctx.font = '13px monospace';
    ctx.fillText('Terima kasih atas kunjungan Anda!', 155, 490);
  } else if (type === 'catatan_kuliah') {
    // Ruled lines
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    for (let y = 110; y < h - 60; y += 34) {
      ctx.beginPath();
      ctx.moveTo(45, y);
      ctx.lineTo(w - 45, y);
      ctx.stroke();
    }
    // Red margin line
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(82, 40);
    ctx.lineTo(82, h - 40);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Catatan Arsitektur Pemrosesan Citra Digital', 96, 85);

    // Yellow highlighter bar
    ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.fillRect(94, 120, 410, 24);

    ctx.fillStyle = '#1e293b';
    ctx.font = '15px sans-serif';
    const notes = [
      '1. Deteksi Tepi Kertas: Mencari 4 titik sudut kontras maksimum.',
      '2. Transformasi Homografi: Meluruskan distorsi perspektif kamera.',
      '3. Normalisasi Latar Putih: Mengangkat nilai luminansi > 168 ke #FFFFFF.',
      '4. Peningkatan Ketajaman: Kernel konvolusi unsharp mask pada teks.',
      '5. Kompresi PDF: Menyusun halaman ke kontainer standar ISO A4.',
    ];
    notes.forEach((n, idx) => {
      ctx.fillText(n, 96, 138 + idx * 68);
    });
  } else {
    // form_identitas
    ctx.font = 'bold 21px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('FORMULIR VERIFIKASI ANGGOTA KOPERASI', 70, 82);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(50, 115, 500, 610);
    const fields = [
      'Nama Lengkap      : Raka Pratama Wijaya',
      'Nomor Induk       : 3174091804950002',
      'Unit Kerja        : Divisi Operasional Logistik',
      'Kota Domisili     : Bandung, Jawa Barat',
      'Status Dokumen    : Aktif & Terverifikasi',
    ];
    ctx.font = '16px monospace';
    fields.forEach((f, idx) => {
      ctx.fillText(f, 75, 180 + idx * 65);
    });
  }
}

/**
 * Loads an image from a dataURL or URL into an HTMLImageElement.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Processes a raw document image using perspective warp, rotation, shadow removal,
 * brightness/contrast, sharpness, and document filter modes on an HTML5 Canvas.
 */
export async function processDocumentImage(
  sourceDataUrl: string,
  corners: QuadCorners,
  params: ScanEnhancementParams
): Promise<{
  processedDataUrl: string;
  width: number;
  height: number;
  quality: QualityAssessment;
}> {
  const img = await loadImageElement(sourceDataUrl);
  const natW = img.naturalWidth || img.width || 720;
  const natH = img.naturalHeight || img.height || 960;
  // Phone photos can be 12+ megapixels; more than this only costs time and memory.
  const srcScale = Math.min(1, MAX_SOURCE_SIDE / Math.max(natW, natH));
  const srcW = Math.max(1, Math.round(natW * srcScale));
  const srcH = Math.max(1, Math.round(natH * srcScale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) {
    throw new Error('Gagal menginisialisasi kanvas pemrosesan gambar.');
  }
  srcCtx.drawImage(img, 0, 0, srcW, srcH);
  const srcPixels = srcCtx.getImageData(0, 0, srcW, srcH).data;

  // Sample luminance & edge variance for QualityAssessment
  const lumSamples: number[] = [];
  let edgeDiffSum = 0;
  let edgeCount = 0;
  const stepY = Math.max(4, Math.floor(srcH / 32));
  const stepX = Math.max(4, Math.floor(srcW / 32));

  for (let y = stepY; y < srcH - stepY; y += stepY) {
    for (let x = stepX; x < srcW - stepX; x += stepX) {
      const idx = (y * srcW + x) * 4;
      const lum = 0.299 * srcPixels[idx] + 0.587 * srcPixels[idx + 1] + 0.114 * srcPixels[idx + 2];
      lumSamples.push(lum);

      const rightIdx = (y * srcW + (x + stepX)) * 4;
      const rightLum =
        0.299 * srcPixels[rightIdx] + 0.587 * srcPixels[rightIdx + 1] + 0.114 * srcPixels[rightIdx + 2];
      edgeDiffSum += Math.abs(lum - rightLum);
      edgeCount++;
    }
  }
  const avgEdgeDiff = edgeCount > 0 ? (edgeDiffSum / edgeCount) * 1.8 : 45;
  const quality = assessImageQuality(lumSamples, avgEdgeDiff);

  // Determine target dimensions after perspective crop
  const activeCorners: QuadCorners =
    params.autoCrop && !params.keepOriginal
      ? corners
      : {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 1, y: 0 },
          bottomRight: { x: 1, y: 1 },
          bottomLeft: { x: 0, y: 1 },
        };

  const dims = calculateOutputDimensions(activeCorners, srcW, srcH);
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(dims.width, dims.height));
  const targetW = Math.max(120, Math.round(dims.width * scale));
  const targetH = Math.max(160, Math.round(dims.height * scale));

  const warpCanvas = document.createElement('canvas');
  warpCanvas.width = targetW;
  warpCanvas.height = targetH;
  const warpCtx = warpCanvas.getContext('2d');
  if (!warpCtx) {
    throw new Error('Gagal membuat kanvas koreksi perspektif.');
  }

  const outImageData = warpCtx.createImageData(targetW, targetH);
  const outPixels = outImageData.data;

  // Perspective rectification with bilinear sampling, so thin strokes do not break up.
  for (let y = 0; y < targetH; y++) {
    const v = targetH > 1 ? y / (targetH - 1) : 0;
    for (let x = 0; x < targetW; x++) {
      const u = targetW > 1 ? x / (targetW - 1) : 0;
      const srcPt = perspectiveMapQuad(activeCorners, u, v);
      const fx = clamp(srcPt.x * (srcW - 1), 0, srcW - 1);
      const fy = clamp(srcPt.y * (srcH - 1), 0, srcH - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const dIdx = (y * targetW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = srcPixels[i00 + c] * (1 - tx) + srcPixels[i10 + c] * tx;
        const bottom = srcPixels[i01 + c] * (1 - tx) + srcPixels[i11 + c] * tx;
        outPixels[dIdx + c] = top * (1 - ty) + bottom * ty;
      }
      outPixels[dIdx + 3] = 255;
    }
  }

  if (!params.keepOriginal) {
    // "Warna Asli" keeps more of the original lighting so colours stay natural.
    const strength = (params.shadowRemoval / 100) * (params.filter === 'warna_asli' ? 0.6 : 1);
    normalizeIllumination(outPixels, targetW, targetH, strength);

    for (let i = 0; i < outPixels.length; i += 4) {
      const [r, g, b] = applyPixelFilter(outPixels[i], outPixels[i + 1], outPixels[i + 2], params);
      outPixels[i] = r;
      outPixels[i + 1] = g;
      outPixels[i + 2] = b;
    }
  }

  // Optional text sharpening pass (lightweight horizontal/vertical contrast boost)
  if (!params.keepOriginal && params.sharpness > 15) {
    const amount = (params.sharpness / 100) * 0.45;
    const copy = new Uint8ClampedArray(outPixels);
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = (y * targetW + x) * 4;
        const left = (y * targetW + (x - 1)) * 4;
        const right = (y * targetW + (x + 1)) * 4;
        const up = ((y - 1) * targetW + x) * 4;
        const down = ((y + 1) * targetW + x) * 4;

        for (let c = 0; c < 3; c++) {
          const lap =
            4 * copy[idx + c] -
            copy[left + c] -
            copy[right + c] -
            copy[up + c] -
            copy[down + c];
          outPixels[idx + c] = clamp(Math.round(copy[idx + c] + amount * lap), 0, 255);
        }
      }
    }
  }

  warpCtx.putImageData(outImageData, 0, 0);

  // Apply rotation (0, 90, 180, 270) and fine straightenAngle (-15 to +15 deg)
  const rot = ((params.rotation % 360) + 360) % 360;
  const swapAxes = rot === 90 || rot === 270;
  const finalW = swapAxes ? targetH : targetW;
  const finalH = swapAxes ? targetW : targetH;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = finalW;
  finalCanvas.height = finalH;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) {
    throw new Error('Gagal membuat kanvas rotasi.');
  }

  // Fill background white for clean margins when straightened
  finalCtx.fillStyle = '#ffffff';
  finalCtx.fillRect(0, 0, finalW, finalH);

  finalCtx.save();
  finalCtx.translate(finalW / 2, finalH / 2);
  const totalAngleRad = ((rot + (params.straightenAngle || 0)) * Math.PI) / 180;
  finalCtx.rotate(totalAngleRad);
  finalCtx.drawImage(warpCanvas, -targetW / 2, -targetH / 2);
  finalCtx.restore();

  return {
    processedDataUrl: finalCanvas.toDataURL('image/jpeg', 0.9),
    width: finalW,
    height: finalH,
    quality,
  };
}

const MAX_SOURCE_SIDE = 2600;
const MAX_OUTPUT_SIDE = 2000;
const DETECT_SIDE = 320;

/**
 * Detects the paper corners in an image (data URL). Returns null when no
 * sheet is found, so the caller can ask the user to place the corners.
 */
export async function detectCornersInImage(src: string): Promise<QuadCorners | null> {
  const img = await loadImageElement(src);
  return detectCornersInSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
}

let detectCanvas: HTMLCanvasElement | null = null;

/** Same as detectCornersInImage for anything drawable, such as a live <video>. */
export function detectCornersInSource(
  source: CanvasImageSource,
  width: number,
  height: number
): QuadCorners | null {
  if (!width || !height) return null;
  const scale = Math.min(1, DETECT_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  detectCanvas ??= document.createElement('canvas');
  detectCanvas.width = w;
  detectCanvas.height = h;
  const ctx = detectCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return detectDocumentCorners(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * Generates initial seed documents so "Dokumen Saya" and "Dokumen Terakhir"
 * are populated immediately on first visit.
 */
export async function generateInitialSavedDocuments(): Promise<SavedDocument[]> {
  const t1 = SAMPLE_GALLERY_TEMPLATES[0];
  const t2 = SAMPLE_GALLERY_TEMPLATES[1];
  const t3 = SAMPLE_GALLERY_TEMPLATES[2];

  const raw1 = renderSampleDocumentPhoto(t1, false);
  const proc1 = await processDocumentImage(raw1, t1.defaultCorners, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'putih_bersih',
  });

  const raw2 = renderSampleDocumentPhoto(t2, false);
  const proc2 = await processDocumentImage(raw2, t2.defaultCorners, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'putih_bersih',
  });

  const raw3 = renderSampleDocumentPhoto(t3, false);
  const proc3 = await processDocumentImage(raw3, t3.defaultCorners, {
    ...DEFAULT_ENHANCEMENT_PARAMS,
    filter: 'hitam_putih',
  });

  return [
    {
      id: 'doc-seed-1',
      name: 'Faktur_Logistik_Nusantara_2026',
      createdAt: '2026-10-18T06:30:00.000Z',
      updatedAt: '2026-10-18T06:45:00.000Z',
      paperSize: 'A4',
      pdfQuality: 'tinggi',
      fileSizeKb: 342,
      storageLocation: '/Penyimpanan Internal/Documents/ScanKertas',
      pages: [
        {
          id: 'page-seed-1',
          label: 'Halaman 1',
          originalDataUrl: raw1,
          processedDataUrl: proc1.processedDataUrl,
          corners: t1.defaultCorners,
          params: { ...DEFAULT_ENHANCEMENT_PARAMS, filter: 'putih_bersih' },
          quality: proc1.quality,
          width: proc1.width,
          height: proc1.height,
          createdAt: '2026-10-18T06:30:00.000Z',
        },
        {
          id: 'page-seed-2',
          label: 'Halaman 2',
          originalDataUrl: raw2,
          processedDataUrl: proc2.processedDataUrl,
          corners: t2.defaultCorners,
          params: { ...DEFAULT_ENHANCEMENT_PARAMS, filter: 'putih_bersih' },
          quality: proc2.quality,
          width: proc2.width,
          height: proc2.height,
          createdAt: '2026-10-18T06:35:00.000Z',
        },
      ],
    },
    {
      id: 'doc-seed-2',
      name: 'Kontrak_Kemitraan_Digital_SPK042',
      createdAt: '2026-10-17T14:20:00.000Z',
      updatedAt: '2026-10-17T14:25:00.000Z',
      paperSize: 'A4',
      pdfQuality: 'tinggi',
      fileSizeKb: 218,
      storageLocation: '/Penyimpanan Internal/Documents/ScanKertas',
      pages: [
        {
          id: 'page-seed-3',
          label: 'Halaman 1',
          originalDataUrl: raw2,
          processedDataUrl: proc2.processedDataUrl,
          corners: t2.defaultCorners,
          params: { ...DEFAULT_ENHANCEMENT_PARAMS, filter: 'putih_bersih' },
          quality: proc2.quality,
          width: proc2.width,
          height: proc2.height,
          createdAt: '2026-10-17T14:20:00.000Z',
        },
      ],
    },
    {
      id: 'doc-seed-3',
      name: 'Kwitansi_ATK_Gramedia_Oktober',
      createdAt: '2026-10-16T09:15:00.000Z',
      updatedAt: '2026-10-16T09:18:00.000Z',
      paperSize: 'Otomatis',
      pdfQuality: 'sedang',
      fileSizeKb: 145,
      storageLocation: '/Penyimpanan Internal/Documents/ScanKertas',
      pages: [
        {
          id: 'page-seed-4',
          label: 'Halaman 1',
          originalDataUrl: raw3,
          processedDataUrl: proc3.processedDataUrl,
          corners: t3.defaultCorners,
          params: { ...DEFAULT_ENHANCEMENT_PARAMS, filter: 'hitam_putih' },
          quality: proc3.quality,
          width: proc3.width,
          height: proc3.height,
          createdAt: '2026-10-16T09:15:00.000Z',
        },
      ],
    },
  ];
}
