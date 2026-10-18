import type { PaperSizeOption, PdfQualityOption } from './scannerLogic.ts';

export interface PdfPageInput {
  jpegDataUrl: string;
  widthPx: number;
  heightPx: number;
}

export interface PdfBuildResult {
  bytes: Uint8Array<ArrayBuffer>;
  pageCount: number;
  fileSizeKb: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:image\/\w+;base64,/, '').trim();
  if (typeof globalThis.atob === 'function') {
    const binStr = globalThis.atob(clean);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(clean, 'base64'));
}

function stringToAsciiBytes(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) & 0xff;
  }
  return arr;
}

/**
 * Generates a valid multi-page PDF 1.4 binary embedding JPEG streams (`DCTDecode`).
 * Works 100% offline in both browser and Node environments.
 */
export function generateMultiPagePdf(
  pages: PdfPageInput[],
  paperSize: PaperSizeOption = 'A4',
  _quality: PdfQualityOption = 'tinggi'
): PdfBuildResult {
  if (!pages || pages.length === 0) {
    throw new Error('Tidak ada halaman untuk diekspor ke PDF.');
  }

  // Object numbering:
  // 1: Catalog
  // 2: Pages Tree
  // For each page i (0..N-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
  const totalObjects = 2 + pages.length * 3;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let currentOffset = 0;

  const pushString = (s: string) => {
    const bytes = stringToAsciiBytes(s);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    currentOffset += b.length;
  };

  // PDF Header
  pushString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  offsets[1] = currentOffset;
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages Kids list
  const kidsRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ');
  offsets[2] = currentOffset;
  pushString(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pages.length} >>\nendobj\n`);

  // Standard A4 size in PDF points (72 pt = 1 inch)
  const A4_W = 595.28;
  const A4_H = 841.89;

  pages.forEach((page, idx) => {
    const pageObjId = 3 + idx * 3;
    const contentObjId = 4 + idx * 3;
    const imageObjId = 5 + idx * 3;

    const imgW = Math.max(10, Math.round(page.widthPx || 800));
    const imgH = Math.max(10, Math.round(page.heightPx || 1100));

    let pageW = A4_W;
    let pageH = A4_H;
    let drawW = A4_W;
    let drawH = A4_H;
    let offsetX = 0;
    let offsetY = 0;

    if (paperSize === 'A4') {
      // Fit image inside A4 with a clean 18pt document margin
      const margin = 18;
      const availW = A4_W - margin * 2;
      const availH = A4_H - margin * 2;
      const scale = Math.min(availW / imgW, availH / imgH);
      drawW = Number((imgW * scale).toFixed(2));
      drawH = Number((imgH * scale).toFixed(2));
      offsetX = Number(((A4_W - drawW) / 2).toFixed(2));
      offsetY = Number(((A4_H - drawH) / 2).toFixed(2));
    } else {
      // Otomatis: match page aspect ratio scaled to 595pt width
      pageW = A4_W;
      pageH = Number(((imgH / imgW) * A4_W).toFixed(2));
      drawW = pageW;
      drawH = pageH;
      offsetX = 0;
      offsetY = 0;
    }

    const imgName = `/Im${idx + 1}`;

    // Page object
    offsets[pageObjId] = currentOffset;
    pushString(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content stream drawing the image
    const contentStream = `q\n${drawW} 0 0 ${drawH} ${offsetX} ${offsetY} cm\n${imgName} Do\nQ\n`;
    offsets[contentObjId] = currentOffset;
    pushString(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    // Image XObject
    const jpegBytes = base64ToUint8Array(page.jpegDataUrl);
    offsets[imageObjId] = currentOffset;
    pushString(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\n` +
        `stream\n`
    );
    pushBytes(jpegBytes);
    pushString('\nendstream\nendobj\n');
  });

  // Cross-reference table
  const xrefOffset = currentOffset;
  pushString(`xref\n0 ${totalObjects + 1}\n`);
  pushString('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    const padded = String(offsets[id]).padStart(10, '0');
    pushString(`${padded} 00000 n \n`);
  }

  // Trailer
  pushString(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  // Merge all chunks into a single Uint8Array
  const finalBytes = new Uint8Array(currentOffset);
  let pos = 0;
  for (const chunk of chunks) {
    finalBytes.set(chunk, pos);
    pos += chunk.length;
  }

  return {
    bytes: finalBytes,
    pageCount: pages.length,
    fileSizeKb: Math.max(1, Math.round(finalBytes.length / 1024)),
  };
}
