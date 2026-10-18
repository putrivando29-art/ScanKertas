import React, { useState } from 'react';
import {
  Search,
  FolderOpen,
  Edit3,
  FileText,
  Share2,
  Trash2,
  Download,
  Plus,
  Check,
  X,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import {
  SavedDocument,
  filterAndSortDocuments,
} from '../utils/scannerLogic.ts';
import { generateMultiPagePdf } from '../utils/pdfGenerator.ts';

interface MyDocumentsViewProps {
  documents: SavedDocument[];
  onRenameDocument: (docId: string, newName: string) => void;
  onDeleteDocument: (docId: string) => void;
  onReEditScan: (doc: SavedDocument) => void;
  onRebuildPdf: (doc: SavedDocument) => void;
  onStartNewScan: () => void;
}

export const MyDocumentsView: React.FC<MyDocumentsViewProps> = ({
  documents,
  onRenameDocument,
  onDeleteDocument,
  onReEditScan,
  onRebuildPdf,
  onStartNewScan,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'terbaru' | 'terlama' | 'nama_asc' | 'halaman_desc'>(
    'terbaru'
  );
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [openedDoc, setOpenedDoc] = useState<SavedDocument | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<SavedDocument | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const filteredDocs = filterAndSortDocuments(documents, searchQuery, sortBy);

  const handleStartRename = (doc: SavedDocument) => {
    setRenamingDocId(doc.id);
    setRenameValue(doc.name);
    setRenameError(null);
  };

  const handleConfirmRename = (docId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Nama dokumen tidak boleh kosong.');
      return;
    }
    onRenameDocument(docId, trimmed);
    setRenamingDocId(null);
    setRenameError(null);
  };

  const handleDownloadSavedDocPdf = (doc: SavedDocument) => {
    const res = generateMultiPagePdf(
      doc.pages.map((p) => ({
        jpegDataUrl: p.processedDataUrl,
        widthPx: p.width,
        heightPx: p.height,
      })),
      doc.paperSize,
      doc.pdfQuality
    );
    const fileName = `${doc.name.replace(/\.pdf$/i, '')}.pdf`;
    const blob = new Blob([res.bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleShareDoc = (doc: SavedDocument) => {
    setShareFeedback(
      `File PDF "${doc.name}.pdf" (${doc.pages.length} hal · ${doc.fileSizeKb} KB) siap dibagikan.`
    );
    setTimeout(() => setShareFeedback(null), 4000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            Dokumen Saya ({documents.length})
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Arsip hasil scan yang tersimpan di HP Anda
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNewScan}
          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Scan Baru</span>
        </button>
      </div>

      {shareFeedback && (
        <div
          role="status"
          className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 text-xs flex items-center justify-between gap-2"
        >
          <span className="truncate">{shareFeedback}</span>
          <button
            type="button"
            onClick={() => setShareFeedback(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Search & Sort Controls */}
      <div className="space-y-2.5">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama dokumen..."
            aria-label="Cari Dokumen"
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          {(
            [
              ['terbaru', 'Terbaru'],
              ['terlama', 'Terlama'],
              ['nama_asc', 'Nama A–Z'],
              ['halaman_desc', 'Halaman'],
            ] as ['terbaru' | 'terlama' | 'nama_asc' | 'halaman_desc', string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-semibold truncate transition-colors ${
                sortBy === key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Document List */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800 space-y-3">
          <FolderOpen className="w-9 h-9 text-slate-400 mx-auto" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {searchQuery ? 'Dokumen Tidak Ditemukan' : 'Belum Ada Dokumen Tersimpan'}
          </h2>
          <button
            type="button"
            onClick={onStartNewScan}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Mulai Scan Pertama</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc) => {
            const firstPage = doc.pages[0];
            const isRenaming = renamingDocId === doc.id;
            const formattedDate = new Date(doc.updatedAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div
                key={doc.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"
              >
                {/* Row 1: Thumbnail + Info + Quick Open */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenedDoc(doc)}
                    className="w-16 h-20 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1 flex items-center justify-center shrink-0 overflow-hidden"
                  >
                    {firstPage ? (
                      <img
                        src={firstPage.processedDataUrl}
                        alt={doc.name}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain bg-white rounded"
                      />
                    ) : (
                      <FileText className="w-6 h-6 text-slate-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => {
                              setRenameValue(e.target.value);
                              if (renameError) setRenameError(null);
                            }}
                            aria-label="Nama Dokumen Baru"
                            className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 rounded-lg border border-teal-600 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRename(doc.id)}
                            aria-label="Simpan Nama"
                            className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingDocId(null)}
                            aria-label="Batal"
                            className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {renameError && (
                          <p className="text-[11px] text-red-600 font-medium">{renameError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate min-w-0">
                          {doc.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => handleStartRename(doc)}
                          className="text-xs font-semibold text-teal-600 dark:text-teal-400 shrink-0"
                        >
                          Ubah Nama
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                      <span>{doc.pages.length} Hal</span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.paperSize}</span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.fileSizeKb} KB</span>
                      <span aria-hidden="true">·</span>
                      <span>{formattedDate}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenedDoc(doc)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-600" />
                        <span>Buka</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadSavedDocPdf(doc)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh PDF</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 2: Clean Action Bar */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onReEditScan(doc)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 truncate"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Edit Scan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRebuildPdf(doc)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 truncate"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Atur PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShareDoc(doc)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 truncate"
                  >
                    <Share2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Bagikan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteDoc(doc)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center justify-center gap-1.5 truncate"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Open Document Viewer */}
      {openedDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Detail Dokumen ${openedDoc.name}`}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {openedDoc.name}.pdf
                </h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {openedDoc.pages.length} Halaman · {openedDoc.paperSize}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadSavedDocPdf(openedDoc)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenedDoc(null)}
                  aria-label="Tutup Dokumen"
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 bg-slate-100 dark:bg-slate-950">
              {openedDoc.pages.map((p, idx) => (
                <div
                  key={p.id}
                  className="mx-auto max-w-sm bg-white p-3 rounded-xl shadow border border-slate-200"
                >
                  <div className="text-xs font-mono text-slate-500 mb-1.5 flex justify-between">
                    <span>Halaman {idx + 1}</span>
                    <span>{p.params.filter.replace('_', ' ')}</span>
                  </div>
                  <img
                    src={p.processedDataUrl}
                    alt={`Halaman ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {confirmDeleteDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Dokumen"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2.5 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Hapus Dokumen Ini?
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Yakin ingin menghapus <strong>{confirmDeleteDoc.name}</strong>?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDocument(confirmDeleteDoc.id);
                  setConfirmDeleteDoc(null);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
