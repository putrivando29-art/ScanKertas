import React, { useState } from 'react';
import {
  FileText,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Camera,
  Image as ImageIcon,
  Download,
  Share2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  X,
} from 'lucide-react';
import {
  ScannedPage,
  PaperSizeOption,
  PdfQualityOption,
} from '../utils/scannerLogic.ts';
import { processDocumentImage } from '../utils/canvasProcessor.ts';
import { generateMultiPagePdf } from '../utils/pdfGenerator.ts';

interface PdfComposerViewProps {
  pages: ScannedPage[];
  documentName: string;
  paperSize: PaperSizeOption;
  pdfQuality: PdfQualityOption;
  storageLocation: string;
  onChangeDocumentName: (name: string) => void;
  onChangePaperSize: (size: PaperSizeOption) => void;
  onChangePdfQuality: (quality: PdfQualityOption) => void;
  onReorderPage: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageId: string) => void;
  onUpdatePage: (page: ScannedPage) => void;
  onEditPageInEnhance: (pageIndex: number) => void;
  onAddFromCamera: () => void;
  onAddFromGallery: () => void;
  onSaveDocumentComplete: (fileSizeKb: number) => void;
  onBackToEditor: () => void;
}

export const PdfComposerView: React.FC<PdfComposerViewProps> = ({
  pages,
  documentName,
  paperSize,
  pdfQuality,
  onChangeDocumentName,
  onChangePaperSize,
  onChangePdfQuality,
  onReorderPage,
  onDeletePage,
  onUpdatePage,
  onEditPageInEnhance,
  onAddFromCamera,
  onAddFromGallery,
  onSaveDocumentComplete,
  onBackToEditor,
}) => {
  const [nameError, setNameError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [showAllPreviewModal, setShowAllPreviewModal] = useState<boolean>(false);
  const [shareModalInfo, setShareModalInfo] = useState<{
    fileName: string;
    sizeKb: number;
    pageCount: number;
  } | null>(null);
  const [rotatingPageId, setRotatingPageId] = useState<string | null>(null);

  const handleRotateSinglePage = async (page: ScannedPage) => {
    setRotatingPageId(page.id);
    try {
      const nextRot = (((page.params.rotation + 90) % 360) + 360) % 360;
      const nextParams = { ...page.params, rotation: nextRot };
      const res = await processDocumentImage(page.originalDataUrl, page.corners, nextParams);
      onUpdatePage({
        ...page,
        params: nextParams,
        processedDataUrl: res.processedDataUrl,
        width: res.width,
        height: res.height,
        quality: res.quality,
      });
    } finally {
      setRotatingPageId(null);
    }
  };

  const validateBeforeExport = (): boolean => {
    setExportError(null);
    const trimmed = documentName.trim();
    if (!trimmed) {
      setNameError('Nama dokumen wajib diisi.');
      return false;
    }
    if (pages.length === 0) {
      setExportError('Belum ada halaman untuk diekspor. Tambahkan minimal 1 halaman.');
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleExportAndSavePdf = (triggerDownload: boolean = true) => {
    if (!validateBeforeExport()) return;

    try {
      const pdfResult = generateMultiPagePdf(
        pages.map((p) => ({
          jpegDataUrl: p.processedDataUrl,
          widthPx: p.width,
          heightPx: p.height,
        })),
        paperSize,
        pdfQuality
      );

      const cleanFileName = `${documentName.trim().replace(/\.pdf$/i, '')}.pdf`;

      if (triggerDownload) {
        const blob = new Blob([pdfResult.bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = cleanFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      setExportSuccessMessage(
        `Dokumen "${cleanFileName}" (${pdfResult.pageCount} halaman · ${pdfResult.fileSizeKb} KB) berhasil disimpan ke Dokumen Saya.`
      );
      onSaveDocumentComplete(pdfResult.fileSizeKb);
    } catch (err: any) {
      setExportError(err?.message || 'Gagal mengekspor PDF.');
    }
  };

  const handleSharePdf = async () => {
    if (!validateBeforeExport()) return;

    try {
      const pdfResult = generateMultiPagePdf(
        pages.map((p) => ({
          jpegDataUrl: p.processedDataUrl,
          widthPx: p.width,
          heightPx: p.height,
        })),
        paperSize,
        pdfQuality
      );
      const cleanFileName = `${documentName.trim().replace(/\.pdf$/i, '')}.pdf`;

      if (typeof navigator.share === 'function') {
        const file = new File([pdfResult.bytes], cleanFileName, {
          type: 'application/pdf',
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: cleanFileName,
            text: `Dokumen hasil scan dari ScanKertas (${pdfResult.pageCount} halaman)`,
            files: [file],
          });
          return;
        }
      }

      setShareModalInfo({
        fileName: cleanFileName,
        sizeKb: pdfResult.fileSizeKb,
        pageCount: pdfResult.pageCount,
      });
    } catch (err: any) {
      setExportError(err?.message || 'Gagal menyiapkan dokumen PDF.');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBackToEditor}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs font-semibold shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate min-w-0">
          Susun &amp; Ekspor PDF ({pages.length} Hal)
        </h1>

        <button
          type="button"
          disabled={pages.length === 0}
          onClick={() => setShowAllPreviewModal(true)}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <Eye className="w-4 h-4 text-teal-600" />
          <span>Pratinjau</span>
        </button>
      </div>

      {/* Status Alerts */}
      {exportError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 text-xs flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {exportSuccessMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportSuccessMessage}</span>
        </div>
      )}

      {/* Document Settings Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3.5">
        <div>
          <label
            htmlFor="pdf-doc-name-input"
            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
          >
            Nama File PDF
          </label>
          <input
            id="pdf-doc-name-input"
            type="text"
            value={documentName}
            onChange={(e) => {
              onChangeDocumentName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="ScanKertas_20261018"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          {nameError && (
            <p role="alert" className="text-xs text-red-600 font-medium mt-1">
              {nameError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Ukuran Kertas
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['A4', 'Otomatis'] as PaperSizeOption[]).map((sz) => {
                const active = paperSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onChangePaperSize(sz)}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {sz === 'A4' ? 'Kertas A4' : 'Otomatis'}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Kualitas PDF
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['tinggi', 'Tinggi'],
                  ['sedang', 'Sedang'],
                  ['kecil', 'Ringan'],
                ] as [PdfQualityOption, string][]
              ).map(([qKey, qLabel]) => {
                const active = pdfQuality === qKey;
                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => onChangePdfQuality(qKey)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {qLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pages Grid Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
            Urutan Halaman ({pages.length})
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onAddFromCamera}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1"
            >
              <Camera className="w-3.5 h-3.5 text-teal-600" />
              <span>+ Kamera</span>
            </button>
            <button
              type="button"
              onClick={onAddFromGallery}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1"
            >
              <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
              <span>+ Galeri</span>
            </button>
          </div>
        </div>

        {pages.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Belum Ada Halaman
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onAddFromCamera}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Kamera</span>
              </button>
              <button
                type="button"
                onClick={onAddFromGallery}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Galeri</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden flex flex-col justify-between min-w-0"
              >
                <div className="relative aspect-[3/4] bg-slate-200/70 dark:bg-slate-950 p-2 flex items-center justify-center">
                  <img
                    src={page.processedDataUrl}
                    alt={`Halaman ${index + 1}`}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain bg-white shadow-sm"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/85 text-white font-mono tabular-nums text-[11px] font-bold">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                </div>

                <div className="p-2 space-y-1.5">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    Halaman {index + 1}
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onReorderPage(index, index - 1)}
                      aria-label={`Majukan Halaman ${index + 1}`}
                      className="min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-35"
                    >
                      <ArrowUp className="w-3.5 h-3.5 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      disabled={index === pages.length - 1}
                      onClick={() => onReorderPage(index, index + 1)}
                      aria-label={`Mundurkan Halaman ${index + 1}`}
                      className="min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-35"
                    >
                      <ArrowDown className="w-3.5 h-3.5 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      disabled={rotatingPageId === page.id}
                      onClick={() => handleRotateSinglePage(page)}
                      aria-label={`Putar Halaman ${index + 1}`}
                      className="min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditPageInEnhance(index)}
                      aria-label={`Edit Halaman ${index + 1}`}
                      className="min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-teal-600"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePage(page.id)}
                      aria-label={`Hapus Halaman ${index + 1}`}
                      className="min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Primary Export Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => handleExportAndSavePdf(true)}
          className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Simpan &amp; Unduh PDF</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleExportAndSavePdf(false)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="truncate">Simpan ke Arsip</span>
          </button>

          <button
            type="button"
            onClick={handleSharePdf}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
          >
            <Share2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="truncate">Bagikan PDF</span>
          </button>
        </div>
      </div>

      {/* Modal: Preview All Pages */}
      {showAllPreviewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau Semua Halaman PDF"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Pratinjau: {documentName || 'Dokumen'}.pdf
              </h2>
              <button
                type="button"
                onClick={() => setShowAllPreviewModal(false)}
                aria-label="Tutup Pratinjau"
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 bg-slate-100 dark:bg-slate-950">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className="mx-auto max-w-sm bg-white p-3 rounded-lg shadow border border-slate-200"
                >
                  <div className="text-xs font-mono text-slate-400 mb-1.5 flex justify-between">
                    <span>Halaman {idx + 1}</span>
                    <span>{paperSize}</span>
                  </div>
                  <img
                    src={p.processedDataUrl}
                    alt={`Pratinjau Halaman ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Share Fallback */}
      {shareModalInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bagikan Dokumen PDF"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Bagikan File PDF
              </h3>
              <button
                type="button"
                onClick={() => setShareModalInfo(null)}
                aria-label="Tutup dialog bagikan"
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              File <strong>{shareModalInfo.fileName}</strong> ({shareModalInfo.pageCount} halaman ·{' '}
              {shareModalInfo.sizeKb} KB) siap diunduh dan dibagikan.
            </p>
            <button
              type="button"
              onClick={() => {
                setShareModalInfo(null);
                handleExportAndSavePdf(true);
              }}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Unduh File PDF Sekarang</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
