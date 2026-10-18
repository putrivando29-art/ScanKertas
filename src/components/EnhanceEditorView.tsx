import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  RotateCw,
  Crop,
  Sliders,
  ArrowRight,
  Camera,
  Image as ImageIcon,
  AlertTriangle,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ScannedPage,
  ScanFilterMode,
  ScanEnhancementParams,
  QuadCorners,
  DEFAULT_ENHANCEMENT_PARAMS,
  FULL_FRAME_CORNERS,
  clamp,
} from '../utils/scannerLogic.ts';
import { processDocumentImage } from '../utils/canvasProcessor.ts';

interface EnhanceEditorViewProps {
  pages: ScannedPage[];
  activePageIndex: number;
  onSelectPageIndex: (idx: number) => void;
  onUpdatePage: (updatedPage: ScannedPage) => void;
  onAddFromCamera: () => void;
  onAddFromGallery: () => void;
  onProceedToPdf: () => void;
}

export const EnhanceEditorView: React.FC<EnhanceEditorViewProps> = ({
  pages,
  activePageIndex,
  onSelectPageIndex,
  onUpdatePage,
  onAddFromCamera,
  onAddFromGallery,
  onProceedToPdf,
}) => {
  const currentPage = pages[activePageIndex] || pages[0];
  const [compareMode, setCompareMode] = useState<'after' | 'before'>('after');
  const [editingCorners, setEditingCorners] = useState<boolean>(false);
  const [showAdvancedSliders, setShowAdvancedSliders] = useState<boolean>(false);
  const [localCorners, setLocalCorners] = useState<QuadCorners>(
    currentPage?.corners || FULL_FRAME_CORNERS
  );
  const [isReprocessing, setIsReprocessing] = useState<boolean>(false);

  useEffect(() => {
    if (currentPage) {
      setLocalCorners(currentPage.corners);
    }
  }, [currentPage?.id]);

  if (!currentPage) {
    return null;
  }

  const applyNewParams = async (
    nextParams: ScanEnhancementParams,
    nextCorners: QuadCorners = currentPage.corners
  ) => {
    setIsReprocessing(true);
    try {
      const result = await processDocumentImage(
        currentPage.originalDataUrl,
        nextCorners,
        nextParams
      );
      onUpdatePage({
        ...currentPage,
        corners: nextCorners,
        params: nextParams,
        processedDataUrl: result.processedDataUrl,
        width: result.width,
        height: result.height,
        quality: result.quality,
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleFilterChange = (filter: ScanFilterMode) => {
    applyNewParams({
      ...currentPage.params,
      filter,
      keepOriginal: false,
    });
  };

  const handleRotate = (deltaDeg: number) => {
    const nextRot = (((currentPage.params.rotation + deltaDeg) % 360) + 360) % 360;
    applyNewParams({
      ...currentPage.params,
      rotation: nextRot,
    });
  };

  const handleResetEnhancements = () => {
    applyNewParams({ ...DEFAULT_ENHANCEMENT_PARAMS }, currentPage.corners);
  };

  const handleSaveManualCorners = () => {
    setEditingCorners(false);
    applyNewParams(
      {
        ...currentPage.params,
        autoCrop: true,
        keepOriginal: false,
      },
      localCorners
    );
  };

  const nudgeLocalCorner = (key: keyof QuadCorners, dx: number, dy: number) => {
    setLocalCorners((prev) => ({
      ...prev,
      [key]: {
        x: Number(clamp(prev[key].x + dx, 0.02, 0.98).toFixed(3)),
        y: Number(clamp(prev[key].y + dy, 0.02, 0.98).toFixed(3)),
      },
    }));
  };

  const filterButtons: { id: ScanFilterMode; label: string; desc: string }[] = [
    { id: 'putih_bersih', label: 'Putih Bersih', desc: 'Latar kertas putih & teks jelas' },
    { id: 'hitam_putih', label: 'Hitam Putih', desc: 'Tinta hitam pekat untuk cetak' },
    { id: 'warna_asli', label: 'Warna Asli', desc: 'Pertahankan warna stempel' },
    { id: 'abu_tajam', label: 'Abu-abu', desc: 'Skala keabuan hemat ukuran' },
  ];

  const polyPoints = `${localCorners.topLeft.x * 100},${localCorners.topLeft.y * 100} ${
    localCorners.topRight.x * 100
  },${localCorners.topRight.y * 100} ${localCorners.bottomRight.x * 100},${
    localCorners.bottomRight.y * 100
  } ${localCorners.bottomLeft.x * 100},${localCorners.bottomLeft.y * 100}`;

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            Rapikan &amp; Filter Scan
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Halaman {activePageIndex + 1} dari {pages.length}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onAddFromCamera}
            className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1"
          >
            <Camera className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>+ Kamera</span>
          </button>

          <button
            type="button"
            onClick={onAddFromGallery}
            className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1"
          >
            <ImageIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>+ Galeri</span>
          </button>
        </div>
      </div>

      {/* Multi-Page Selector Strip */}
      {pages.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {pages.map((p, idx) => {
            const isCurrent = idx === activePageIndex;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPageIndex(idx)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold shrink-0 ${
                  isCurrent
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>Hal {idx + 1}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quality Warning if any */}
      {currentPage.quality.warnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{currentPage.quality.warnings[0]}</span>
        </div>
      )}

      {/* Document Preview Card */}
      <div className="bg-slate-900 rounded-2xl p-3 sm:p-5 border border-slate-800 space-y-3">
        {/* Before / After Switcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-xl w-48">
            <button
              type="button"
              onClick={() => {
                setEditingCorners(false);
                setCompareMode('after');
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                !editingCorners && compareMode === 'after'
                  ? 'bg-teal-500 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              Sesudah
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCorners(false);
                setCompareMode('before');
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                !editingCorners && compareMode === 'before'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              Sebelum
            </button>
          </div>

          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
            {isReprocessing ? 'Memproses...' : `${currentPage.width}×${currentPage.height}`}
          </span>
        </div>

        {/* Canvas Preview or Corner Editor */}
        {editingCorners ? (
          <div className="w-full max-w-[380px] mx-auto space-y-3">
            <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 border border-slate-700">
              <img
                src={currentPage.originalDataUrl}
                alt="Atur 4 Sudut Kertas"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polygon
                  points={polyPoints}
                  fill="rgba(20, 184, 166, 0.2)"
                  stroke="#14b8a6"
                  strokeWidth="1"
                />
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['topLeft', 'Kiri Atas'],
                  ['topRight', 'Kanan Atas'],
                  ['bottomRight', 'Kanan Bawah'],
                  ['bottomLeft', 'Kiri Bawah'],
                ] as [keyof QuadCorners, string][]
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="p-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-1"
                >
                  <span className="text-[11px] font-medium text-slate-200 truncate">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => nudgeLocalCorner(key, -0.02, 0)}
                      className="w-6 h-6 rounded bg-slate-700 text-white text-xs font-mono"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => nudgeLocalCorner(key, 0.02, 0)}
                      className="w-6 h-6 rounded bg-slate-700 text-white text-xs font-mono"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => nudgeLocalCorner(key, 0, -0.02)}
                      className="w-6 h-6 rounded bg-slate-700 text-white text-xs font-mono"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => nudgeLocalCorner(key, 0, 0.02)}
                      className="w-6 h-6 rounded bg-slate-700 text-white text-xs font-mono"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditingCorners(false)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveManualCorners}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-teal-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Terapkan Sudut</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[380px] mx-auto aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-lg">
            <img
              src={
                compareMode === 'before'
                  ? currentPage.originalDataUrl
                  : currentPage.processedDataUrl
              }
              alt={
                compareMode === 'before'
                  ? 'Pratinjau Foto Asli'
                  : 'Pratinjau Dokumen Hasil Scan'
              }
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain bg-white"
            />
          </div>
        )}

        {/* Quick 3-Button Geometry Bar */}
        <div className="w-full max-w-[380px] mx-auto grid grid-cols-3 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => handleRotate(-90)}
            className="min-h-[42px] px-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Putar Kiri</span>
          </button>

          <button
            type="button"
            onClick={() => handleRotate(90)}
            className="min-h-[42px] px-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap"
          >
            <RotateCw className="w-3.5 h-3.5 shrink-0" />
            <span>Putar Kanan</span>
          </button>

          <button
            type="button"
            onClick={() => setEditingCorners((prev) => !prev)}
            className="min-h-[42px] px-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap"
          >
            <Crop className="w-3.5 h-3.5 shrink-0" />
            <span>Potong Tepi</span>
          </button>
        </div>
      </div>

      {/* Filter Selection Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Pilih Filter Hasil Scan
          </h2>
          <button
            type="button"
            onClick={() =>
              applyNewParams({
                ...currentPage.params,
                keepOriginal: !currentPage.params.keepOriginal,
              })
            }
            className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              currentPage.params.keepOriginal
                ? 'bg-amber-500 text-slate-950 border-amber-500'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {currentPage.params.keepOriginal ? 'Foto Asli: Aktif' : 'Gunakan Foto Asli'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {filterButtons.map((fb) => {
            const isSelected =
              !currentPage.params.keepOriginal && currentPage.params.filter === fb.id;
            return (
              <button
                key={fb.id}
                type="button"
                onClick={() => handleFilterChange(fb.id)}
                className={`p-3 rounded-xl border text-left transition-all min-w-0 ${
                  isSelected
                    ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 ring-1 ring-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {fb.label}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {fb.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Collapsible Fine Adjustments Accordion */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowAdvancedSliders((prev) => !prev)}
            aria-expanded={showAdvancedSliders}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Atur Ketajaman, Bayangan &amp; Kontras Manual</span>
            </span>
            {showAdvancedSliders ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showAdvancedSliders && (
            <div className="mt-3 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Potong Area Luar Kertas (Auto Crop)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyNewParams({
                        ...currentPage.params,
                        autoCrop: !currentPage.params.autoCrop,
                      })
                    }
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold ${
                      currentPage.params.autoCrop
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {currentPage.params.autoCrop ? 'Aktif' : 'Nonaktif'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetEnhancements}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="slider-shadow" className="font-medium">
                    Kurangi Bayangan &amp; Putihkan Kertas
                  </label>
                  <span className="font-mono tabular-nums text-slate-500">
                    {currentPage.params.shadowRemoval}%
                  </span>
                </div>
                <input
                  id="slider-shadow"
                  type="range"
                  min={0}
                  max={100}
                  value={currentPage.params.shadowRemoval}
                  onChange={(e) =>
                    applyNewParams({
                      ...currentPage.params,
                      shadowRemoval: Number(e.target.value),
                    })
                  }
                  className="w-full accent-teal-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="slider-sharpness" className="font-medium">
                    Tingkatkan Ketajaman Tulisan
                  </label>
                  <span className="font-mono tabular-nums text-slate-500">
                    {currentPage.params.sharpness}%
                  </span>
                </div>
                <input
                  id="slider-sharpness"
                  type="range"
                  min={0}
                  max={100}
                  value={currentPage.params.sharpness}
                  onChange={(e) =>
                    applyNewParams({
                      ...currentPage.params,
                      sharpness: Number(e.target.value),
                    })
                  }
                  className="w-full accent-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="slider-brightness" className="font-medium">
                      Kecerahan
                    </label>
                    <span className="font-mono tabular-nums text-slate-500">
                      {currentPage.params.brightness}
                    </span>
                  </div>
                  <input
                    id="slider-brightness"
                    type="range"
                    min={-50}
                    max={50}
                    value={currentPage.params.brightness}
                    onChange={(e) =>
                      applyNewParams({
                        ...currentPage.params,
                        brightness: Number(e.target.value),
                      })
                    }
                    className="w-full accent-teal-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="slider-contrast" className="font-medium">
                      Kontras Teks
                    </label>
                    <span className="font-mono tabular-nums text-slate-500">
                      {currentPage.params.contrast}
                    </span>
                  </div>
                  <input
                    id="slider-contrast"
                    type="range"
                    min={-50}
                    max={50}
                    value={currentPage.params.contrast}
                    onChange={(e) =>
                      applyNewParams({
                        ...currentPage.params,
                        contrast: Number(e.target.value),
                      })
                    }
                    className="w-full accent-teal-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Bottom CTA */}
      <button
        type="button"
        onClick={onProceedToPdf}
        className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
      >
        <span>Selesai &amp; Susun Jadi PDF ({pages.length} Halaman)</span>
        <ArrowRight className="w-4 h-4 shrink-0" />
      </button>
    </div>
  );
};
