import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  CheckSquare,
  Square,
  ArrowLeft,
  PlusCircle,
} from 'lucide-react';
import {
  ScanFilterMode,
  QuadCorners,
  DEFAULT_CORNERS,
  FULL_FRAME_CORNERS,
} from '../utils/scannerLogic.ts';
import {
  SAMPLE_GALLERY_TEMPLATES,
  renderSampleDocumentPhoto,
} from '../utils/canvasProcessor.ts';

export interface GalleryBatchItem {
  id: string;
  title: string;
  category: string;
  rawDataUrl: string;
  corners: QuadCorners;
}

interface GalleryImportViewProps {
  defaultAutoCrop: boolean;
  defaultFilter: ScanFilterMode;
  onImportBatch: (
    items: GalleryBatchItem[],
    options: {
      autoCrop: boolean;
      keepOriginal: boolean;
      filter: ScanFilterMode;
    }
  ) => Promise<void>;
  onCancel: () => void;
}

export const GalleryImportView: React.FC<GalleryImportViewProps> = ({
  defaultAutoCrop,
  defaultFilter,
  onImportBatch,
  onCancel,
}) => {
  const [galleryItems, setGalleryItems] = useState<GalleryBatchItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(['sample-faktur']);
  const [autoCrop, setAutoCrop] = useState<boolean>(defaultAutoCrop);
  const [keepOriginal, setKeepOriginal] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<ScanFilterMode>(defaultFilter);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const generated: GalleryBatchItem[] = SAMPLE_GALLERY_TEMPLATES.map((tpl) => ({
      id: tpl.id,
      title: tpl.title,
      category: tpl.category,
      rawDataUrl: renderSampleDocumentPhoto(tpl, false),
      corners: tpl.defaultCorners,
    }));
    setGalleryItems(generated);
  }, []);

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === galleryItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(galleryItems.map((g) => g.id));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const newId = `upload-${Date.now()}-${index}`;
          const newItem: GalleryBatchItem = {
            id: newId,
            title: file.name.replace(/\.[^/.]+$/, '') || `Foto Galeri ${index + 1}`,
            category: 'Foto Perangkat',
            rawDataUrl: reader.result,
            corners: DEFAULT_CORNERS,
          };
          setGalleryItems((prev) => [newItem, ...prev]);
          setSelectedIds((prev) => [...prev, newId]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    const chosen = galleryItems.filter((item) => selectedIds.includes(item.id));
    if (chosen.length === 0 || isProcessing) return;

    setIsProcessing(true);
    try {
      await onImportBatch(
        chosen.map((item) => ({
          ...item,
          corners: autoCrop && !keepOriginal ? item.corners : FULL_FRAME_CORNERS,
        })),
        {
          autoCrop: autoCrop && !keepOriginal,
          keepOriginal,
          filter: selectedFilter,
        }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const filterChoices: { id: ScanFilterMode; label: string }[] = [
    { id: 'putih_bersih', label: 'Putih Bersih' },
    { id: 'hitam_putih', label: 'Hitam Putih' },
    { id: 'warna_asli', label: 'Warna Asli' },
    { id: 'abu_tajam', label: 'Abu-abu' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs font-semibold shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate min-w-0">
          Import Foto dari Galeri
        </h1>

        <div className="shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="gallery-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Pilih Foto HP</span>
          </button>
        </div>
      </div>

      {/* Quick Import Settings Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={keepOriginal}
            onClick={() => setAutoCrop((prev) => !prev)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-left disabled:opacity-50"
          >
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              Auto Crop &amp; Luruskan Kertas
            </span>
            {autoCrop && !keepOriginal ? (
              <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setKeepOriginal((prev) => !prev)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              Pertahankan Foto Asli
            </span>
            {keepOriginal ? (
              <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>
        </div>

        {/* Filter Mode Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {filterChoices.map((fc) => {
            const active = selectedFilter === fc.id && !keepOriginal;
            return (
              <button
                key={fc.id}
                type="button"
                disabled={keepOriginal}
                onClick={() => setSelectedFilter(fc.id)}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border truncate transition-colors ${
                  active
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 disabled:opacity-40'
                }`}
              >
                {fc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-Select Photo Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
            Pilih Foto ({selectedIds.length} dipilih)
          </span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0"
          >
            {selectedIds.length === galleryItems.length ? 'Batal Semua' : 'Pilih Semua'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {galleryItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const selectionOrder = selectedIds.indexOf(item.id) + 1;
            const c = item.corners;
            const poly = `${c.topLeft.x * 100},${c.topLeft.y * 100} ${
              c.topRight.x * 100
            },${c.topRight.y * 100} ${c.bottomRight.x * 100},${
              c.bottomRight.y * 100
            } ${c.bottomLeft.x * 100},${c.bottomLeft.y * 100}`;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleSelectItem(item.id)}
                aria-pressed={isSelected}
                className={`text-left rounded-xl overflow-hidden border transition-all flex flex-col min-w-0 ${
                  isSelected
                    ? 'border-teal-600 ring-2 ring-teal-600/20 bg-teal-50/30 dark:bg-teal-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                <div className="relative w-full aspect-[3/4] bg-slate-900 overflow-hidden">
                  <img
                    src={item.rawDataUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {autoCrop && !keepOriginal && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <polygon
                        points={poly}
                        fill="rgba(20, 184, 166, 0.14)"
                        stroke="#14b8a6"
                        strokeWidth="1.2"
                      />
                    </svg>
                  )}

                  <div className="absolute top-2 right-2">
                    {isSelected ? (
                      <span className="w-6 h-6 rounded-lg bg-teal-600 text-white font-mono text-xs font-bold flex items-center justify-center shadow">
                        {selectionOrder}
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-lg bg-slate-900/70 text-white flex items-center justify-center">
                        <Square className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Primary Import Button */}
      <button
        type="button"
        disabled={selectedIds.length === 0 || isProcessing}
        onClick={handleConfirmImport}
        className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
      >
        <PlusCircle className="w-5 h-5 shrink-0" />
        <span>
          {isProcessing
            ? 'Memproses Foto...'
            : `Tambahkan ke Dokumen (${selectedIds.length} Foto)`}
        </span>
      </button>
    </div>
  );
};
