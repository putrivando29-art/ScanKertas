import { useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  FolderOpen,
  Settings,
  ArrowRight,
  ScanLine,
  Download,
  RotateCcw,
  Eye,
  Edit3,
  Smartphone,
} from 'lucide-react';
import {
  ScannedPage,
  SavedDocument,
  AppSettings,
  QuadCorners,
  ScanFilterMode,
  PaperSizeOption,
  PdfQualityOption,
  DEFAULT_SETTINGS,
  DEFAULT_ENHANCEMENT_PARAMS,
  formatDefaultFileName,
} from './utils/scannerLogic.ts';
import {
  processDocumentImage,
  generateInitialSavedDocuments,
  SAMPLE_GALLERY_TEMPLATES,
  renderSampleDocumentPhoto,
} from './utils/canvasProcessor.ts';
import { generateMultiPagePdf } from './utils/pdfGenerator.ts';
import { CameraScannerView } from './components/CameraScannerView.tsx';
import { GalleryImportView, GalleryBatchItem } from './components/GalleryImportView.tsx';
import { EnhanceEditorView } from './components/EnhanceEditorView.tsx';
import { PdfComposerView } from './components/PdfComposerView.tsx';
import { MyDocumentsView } from './components/MyDocumentsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { OfflineIndicator, ApkGuideModal, usePWAInstall } from './components/PWAInstallSection.tsx';

export type ActiveTab = 'beranda' | 'kamera' | 'galeri' | 'rapikan' | 'pdf' | 'dokumen' | 'pengaturan';

const STORAGE_KEY_DOCS = 'scankertas_saved_docs_v1';
const STORAGE_KEY_SETTINGS = 'scankertas_settings_v1';
const STORAGE_KEY_DRAFT = 'scankertas_active_draft_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('beranda');
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  // Active working document session (persisted for "Pemulihan Halaman saat Kembali")
  const [activePages, setActivePages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [activeDocName, setActiveDocName] = useState<string>(() =>
    formatDefaultFileName(DEFAULT_SETTINGS.defaultFilePrefix)
  );
  const [activePaperSize, setActivePaperSize] = useState<PaperSizeOption>(
    DEFAULT_SETTINGS.defaultPaperSize
  );
  const [activePdfQuality, setActivePdfQuality] = useState<PdfQualityOption>(
    DEFAULT_SETTINGS.defaultPdfResolution
  );
  const [editingSavedDocId, setEditingSavedDocId] = useState<string | null>(null);

  // Saved documents repository
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Hero before/after interactive demo state on Home
  const [heroDemoMode, setHeroDemoMode] = useState<'after' | 'before'>('after');
  const [heroBeforeUrl, setHeroBeforeUrl] = useState<string>('');
  const [heroAfterUrl, setHeroAfterUrl] = useState<string>('');
  const [showApkGuideModal, setShowApkGuideModal] = useState<boolean>(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Load saved documents, draft session, and hero demo on mount
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const heroTpl = SAMPLE_GALLERY_TEMPLATES[0];
        const rawHero = renderSampleDocumentPhoto(heroTpl, false);
        const procHero = await processDocumentImage(rawHero, heroTpl.defaultCorners, {
          ...DEFAULT_ENHANCEMENT_PARAMS,
          filter: 'putih_bersih',
        });
        if (mounted) {
          setHeroBeforeUrl(rawHero);
          setHeroAfterUrl(procHero.processedDataUrl);
        }

        const rawDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
        if (rawDraft) {
          const parsedDraft = JSON.parse(rawDraft);
          if (Array.isArray(parsedDraft.pages) && parsedDraft.pages.length > 0 && mounted) {
            setActivePages(parsedDraft.pages);
            setActiveDocName(
              parsedDraft.docName || formatDefaultFileName(settings.defaultFilePrefix)
            );
            setActivePaperSize(parsedDraft.paperSize || settings.defaultPaperSize);
            setActivePdfQuality(parsedDraft.pdfQuality || settings.defaultPdfResolution);
          }
        }

        const rawSaved = localStorage.getItem(STORAGE_KEY_DOCS);
        if (rawSaved) {
          const parsedSaved = JSON.parse(rawSaved);
          if (Array.isArray(parsedSaved) && parsedSaved.length > 0 && mounted) {
            setSavedDocuments(parsedSaved);
            setIsInitializing(false);
            return;
          }
        }

        const seeded = await generateInitialSavedDocuments();
        if (mounted) {
          setSavedDocuments(seeded);
          try {
            localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(seeded));
          } catch {
            // ignore quota
          }
        }
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync theme class on document root
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Reset scroll to top on view navigation
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // Persist active draft session for "Pemulihan Halaman saat Kembali"
  useEffect(() => {
    try {
      if (activePages.length > 0) {
        localStorage.setItem(
          STORAGE_KEY_DRAFT,
          JSON.stringify({
            pages: activePages,
            docName: activeDocName,
            paperSize: activePaperSize,
            pdfQuality: activePdfQuality,
          })
        );
      } else {
        localStorage.removeItem(STORAGE_KEY_DRAFT);
      }
    } catch {
      // ignore quota
    }
  }, [activePages, activeDocName, activePaperSize, activePdfQuality]);

  const persistSavedDocs = (nextDocs: SavedDocument[]) => {
    setSavedDocuments(nextDocs);
    try {
      localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(nextDocs));
    } catch {
      // ignore quota
    }
  };

  const handleCameraCaptureConfirmed = async (
    rawDataUrl: string,
    detectedCorners: QuadCorners,
    label: string
  ) => {
    const defaultFilter: ScanFilterMode = settings.autoWhiteBackground
      ? 'putih_bersih'
      : 'warna_asli';
    const params = {
      ...DEFAULT_ENHANCEMENT_PARAMS,
      filter: defaultFilter,
      autoCrop: true,
      keepOriginal: false,
    };

    const processed = await processDocumentImage(rawDataUrl, detectedCorners, params);
    const newPage: ScannedPage = {
      id: `page-${Date.now()}`,
      label: label || `Halaman ${activePages.length + 1}`,
      originalDataUrl: rawDataUrl,
      processedDataUrl: processed.processedDataUrl,
      corners: detectedCorners,
      params,
      quality: processed.quality,
      width: processed.width,
      height: processed.height,
      createdAt: new Date().toISOString(),
    };

    const nextPages = [...activePages, newPage];
    setActivePages(nextPages);
    setActivePageIndex(nextPages.length - 1);
    if (activePages.length === 0) {
      setActiveDocName(formatDefaultFileName(settings.defaultFilePrefix));
      setActivePaperSize(settings.defaultPaperSize);
      setActivePdfQuality(settings.defaultPdfResolution);
    }
    setActiveTab('rapikan');
  };

  const handleGalleryImportBatch = async (
    items: GalleryBatchItem[],
    options: {
      autoCrop: boolean;
      keepOriginal: boolean;
      filter: ScanFilterMode;
    }
  ) => {
    const createdPages: ScannedPage[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const params = {
        ...DEFAULT_ENHANCEMENT_PARAMS,
        filter: options.filter,
        autoCrop: options.autoCrop,
        keepOriginal: options.keepOriginal,
      };
      const proc = await processDocumentImage(item.rawDataUrl, item.corners, params);
      createdPages.push({
        id: `page-${Date.now()}-${i}`,
        label: item.title,
        originalDataUrl: item.rawDataUrl,
        processedDataUrl: proc.processedDataUrl,
        corners: item.corners,
        params,
        quality: proc.quality,
        width: proc.width,
        height: proc.height,
        createdAt: new Date().toISOString(),
      });
    }

    const nextPages = [...activePages, ...createdPages];
    setActivePages(nextPages);
    setActivePageIndex(nextPages.length - createdPages.length);
    if (activePages.length === 0) {
      setActiveDocName(formatDefaultFileName(settings.defaultFilePrefix));
      setActivePaperSize(settings.defaultPaperSize);
      setActivePdfQuality(settings.defaultPdfResolution);
    }
    setActiveTab('rapikan');
  };

  const handleUpdateActivePage = (updatedPage: ScannedPage) => {
    setActivePages((prev) =>
      prev.map((p) => (p.id === updatedPage.id ? updatedPage : p))
    );
  };

  const handleReorderPage = (fromIndex: number, toIndex: number) => {
    setActivePages((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  };

  const handleDeleteActivePage = (pageId: string) => {
    setActivePages((prev) => {
      const next = prev.filter((p) => p.id !== pageId);
      if (activePageIndex >= next.length) {
        setActivePageIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleSaveDocumentComplete = (fileSizeKb: number) => {
    const nowIso = new Date().toISOString();
    const cleanName = activeDocName.trim() || formatDefaultFileName(settings.defaultFilePrefix);

    if (editingSavedDocId) {
      const updated = savedDocuments.map((doc) =>
        doc.id === editingSavedDocId
          ? {
              ...doc,
              name: cleanName,
              updatedAt: nowIso,
              paperSize: activePaperSize,
              pdfQuality: activePdfQuality,
              pages: activePages,
              fileSizeKb,
            }
          : doc
      );
      persistSavedDocs(updated);
    } else {
      const newDoc: SavedDocument = {
        id: `doc-${Date.now()}`,
        name: cleanName,
        createdAt: nowIso,
        updatedAt: nowIso,
        paperSize: activePaperSize,
        pdfQuality: activePdfQuality,
        pages: activePages,
        fileSizeKb,
        storageLocation: settings.storageLocation,
      };
      setEditingSavedDocId(newDoc.id);
      persistSavedDocs([newDoc, ...savedDocuments]);
    }
  };

  const handleStartFreshPdf = async () => {
    if (activePages.length > 0) {
      setActiveTab('pdf');
      return;
    }
    const tpl = SAMPLE_GALLERY_TEMPLATES[0];
    const raw = renderSampleDocumentPhoto(tpl, false);
    const proc = await processDocumentImage(raw, tpl.defaultCorners, DEFAULT_ENHANCEMENT_PARAMS);
    const initialPage: ScannedPage = {
      id: `page-${Date.now()}`,
      label: tpl.title,
      originalDataUrl: raw,
      processedDataUrl: proc.processedDataUrl,
      corners: tpl.defaultCorners,
      params: { ...DEFAULT_ENHANCEMENT_PARAMS },
      quality: proc.quality,
      width: proc.width,
      height: proc.height,
      createdAt: new Date().toISOString(),
    };
    setActivePages([initialPage]);
    setActivePageIndex(0);
    setActiveDocName(formatDefaultFileName(settings.defaultFilePrefix));
    setEditingSavedDocId(null);
    setActiveTab('pdf');
  };

  const handleReEditSavedDoc = (doc: SavedDocument) => {
    setActivePages(doc.pages);
    setActivePageIndex(0);
    setActiveDocName(doc.name);
    setActivePaperSize(doc.paperSize);
    setActivePdfQuality(doc.pdfQuality);
    setEditingSavedDocId(doc.id);
    setActiveTab('rapikan');
  };

  const handleRebuildPdfSavedDoc = (doc: SavedDocument) => {
    setActivePages(doc.pages);
    setActivePageIndex(0);
    setActiveDocName(doc.name);
    setActivePaperSize(doc.paperSize);
    setActivePdfQuality(doc.pdfQuality);
    setEditingSavedDocId(doc.id);
    setActiveTab('pdf');
  };

  const handleQuickDownloadDoc = (doc: SavedDocument) => {
    const res = generateMultiPagePdf(
      doc.pages.map((p) => ({
        jpegDataUrl: p.processedDataUrl,
        widthPx: p.width,
        heightPx: p.height,
      })),
      doc.paperSize,
      doc.pdfQuality
    );
    const blob = new Blob([res.bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name.replace(/\.pdf$/i, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 md:pb-10">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#beranda"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('beranda');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          ScanKertas
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav aria-label="Navigasi Utama" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            type="button"
            onClick={() => setActiveTab('beranda')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'beranda'
                ? 'text-teal-600 dark:text-teal-400 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Beranda
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kamera')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'kamera'
                ? 'text-teal-600 dark:text-teal-400 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Pindai Kamera
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('galeri')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'galeri'
                ? 'text-teal-600 dark:text-teal-400 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Import Galeri
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dokumen')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'dokumen'
                ? 'text-teal-600 dark:text-teal-400 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Dokumen Saya
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pengaturan')}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'pengaturan'
                ? 'text-teal-600 dark:text-teal-400 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Pengaturan
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('kamera')}
            className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-500 transition-colors whitespace-nowrap shrink-0"
          >
            Mulai Pindai
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {activeTab === 'beranda' && (
          <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* Session Recovery Card ("Pemulihan Halaman saat Kembali") */}
            {activePages.length > 0 && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-teal-500/40 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={activePages[0].processedDataUrl}
                      alt="Draft Halaman"
                      referrerPolicy="no-referrer"
                      className="w-10 h-13 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        Lanjutkan: {activeDocName}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                        {activePages.length} Halaman · Kertas {activePaperSize}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePages([]);
                      setEditingSavedDocId(null);
                    }}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0"
                  >
                    Mulai Baru
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('rapikan')}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span className="truncate">Edit Filter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pdf')}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 truncate"
                  >
                    <span className="truncate">Susun PDF</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* Simple Android-First Main Launcher & Preview Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
              {/* Left 7 Columns: Simple & Direct Action Card */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    Pemindai Kertas Android · 100% Offline di HP
                  </div>
                  <h1
                    style={{ textWrap: 'balance' }}
                    className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug"
                  >
                    Scan Kertas Jadi Dokumen Putih Bersih &amp; PDF.
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Potong tepi kertas otomatis, luruskan foto miring, putihkan latar belakang, lalu simpan atau bagikan ke PDF A4.
                  </p>
                </div>

                {/* Big Thumb-Friendly Android Action Buttons */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('kamera')}
                    className="w-full min-h-[54px] px-4 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.99] transition-all"
                  >
                    <Camera className="w-5 h-5 shrink-0" />
                    <span>Pindai Kamera Sekarang</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('galeri')}
                      className="min-h-[48px] px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 truncate"
                    >
                      <ImageIcon className="w-4 h-4 text-teal-400 shrink-0" />
                      <span className="truncate">Import Galeri</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleStartFreshPdf}
                      className="min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 text-slate-900 dark:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 truncate"
                    >
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="truncate">Buat PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Compact Interactive Before / After Card */}
              <div className="lg:col-span-5 bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white whitespace-nowrap">
                    Hasil Scan Otomatis
                  </span>

                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setHeroDemoMode('before')}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        heroDemoMode === 'before'
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-300'
                      }`}
                    >
                      Sebelum
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroDemoMode('after')}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        heroDemoMode === 'after'
                          ? 'bg-teal-500 text-slate-950'
                          : 'text-slate-300'
                      }`}
                    >
                      Sesudah
                    </button>
                  </div>
                </div>

                <div className="relative h-52 sm:h-60 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center p-2">
                  {heroAfterUrl ? (
                    <img
                      src={heroDemoMode === 'before' ? heroBeforeUrl : heroAfterUrl}
                      alt={
                        heroDemoMode === 'before'
                          ? 'Contoh Foto Kertas Miring Sebelum Dipindai'
                          : 'Contoh Dokumen Hasil Scan Putih Bersih'
                      }
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain rounded bg-white shadow"
                    />
                  ) : (
                    <div className="text-xs text-slate-400">Menyiapkan pratinjau...</div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span className="truncate">
                    {heroDemoMode === 'before'
                      ? 'Foto asli: Miring & berbayang'
                      : 'Hasil scan: Lurus & putih bersih'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('kamera')}
                    className="text-teal-400 font-semibold shrink-0"
                  >
                    Coba Scan →
                  </button>
                </div>
              </div>
            </section>

            {/* Recent Documents Section ("Daftar Dokumen Terakhir") */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  Dokumen Terakhir ({savedDocuments.length})
                </h2>

                <button
                  type="button"
                  onClick={() => setActiveTab('dokumen')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 shrink-0"
                >
                  <span>Lihat Semua</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>

              {isInitializing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-36 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 animate-pulse"
                    />
                  ))}
                </div>
              ) : savedDocuments.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500">
                    Belum ada dokumen tersimpan. Ketuk <strong>Pindai Kamera</strong> untuk mulai.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {savedDocuments.slice(0, 3).map((doc) => {
                    const thumb = doc.pages[0]?.processedDataUrl;
                    const dateStr = new Date(doc.updatedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                    });

                    return (
                      <div
                        key={doc.id}
                        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between gap-3 min-w-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-14 h-18 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                            {thumb && (
                              <img
                                src={thumb}
                                alt={doc.name}
                                referrerPolicy="no-referrer"
                                className="max-h-full max-w-full object-contain bg-white rounded"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {doc.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                              <span>{doc.pages.length} Hal</span>
                              <span aria-hidden="true">·</span>
                              <span>{doc.paperSize}</span>
                              <span aria-hidden="true">·</span>
                              <span>{doc.fileSizeKb} KB</span>
                              <span aria-hidden="true">·</span>
                              <span>{dateStr}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleReEditSavedDoc(doc)}
                            className="min-h-[36px] px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 truncate"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate">Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRebuildPdfSavedDoc(doc)}
                            className="min-h-[36px] px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 truncate"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate">PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDownloadDoc(doc)}
                            aria-label={`Unduh PDF ${doc.name}`}
                            className="min-h-[36px] px-2 py-1 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1 truncate"
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Unduh</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'kamera' && (
          <CameraScannerView
            autoDetectEnabled={settings.autoDetectEdges}
            onCaptureConfirmed={handleCameraCaptureConfirmed}
            onCancel={() =>
              setActiveTab(activePages.length > 0 ? 'rapikan' : 'beranda')
            }
          />
        )}

        {activeTab === 'galeri' && (
          <GalleryImportView
            defaultAutoCrop={settings.autoDetectEdges}
            defaultFilter={settings.autoWhiteBackground ? 'putih_bersih' : 'warna_asli'}
            onImportBatch={handleGalleryImportBatch}
            onCancel={() =>
              setActiveTab(activePages.length > 0 ? 'rapikan' : 'beranda')
            }
          />
        )}

        {activeTab === 'rapikan' && (
          <EnhanceEditorView
            pages={activePages}
            activePageIndex={activePageIndex}
            onSelectPageIndex={setActivePageIndex}
            onUpdatePage={handleUpdateActivePage}
            onAddFromCamera={() => setActiveTab('kamera')}
            onAddFromGallery={() => setActiveTab('galeri')}
            onProceedToPdf={() => setActiveTab('pdf')}
          />
        )}

        {activeTab === 'pdf' && (
          <PdfComposerView
            pages={activePages}
            documentName={activeDocName}
            paperSize={activePaperSize}
            pdfQuality={activePdfQuality}
            storageLocation={settings.storageLocation}
            onChangeDocumentName={setActiveDocName}
            onChangePaperSize={setActivePaperSize}
            onChangePdfQuality={setActivePdfQuality}
            onReorderPage={handleReorderPage}
            onDeletePage={handleDeleteActivePage}
            onUpdatePage={handleUpdateActivePage}
            onEditPageInEnhance={(idx) => {
              setActivePageIndex(idx);
              setActiveTab('rapikan');
            }}
            onAddFromCamera={() => setActiveTab('kamera')}
            onAddFromGallery={() => setActiveTab('galeri')}
            onSaveDocumentComplete={handleSaveDocumentComplete}
            onBackToEditor={() =>
              setActiveTab(activePages.length > 0 ? 'rapikan' : 'beranda')
            }
          />
        )}

        {activeTab === 'dokumen' && (
          <MyDocumentsView
            documents={savedDocuments}
            onRenameDocument={(docId, newName) => {
              const updated = savedDocuments.map((d) =>
                d.id === docId
                  ? { ...d, name: newName, updatedAt: new Date().toISOString() }
                  : d
              );
              persistSavedDocs(updated);
            }}
            onDeleteDocument={(docId) => {
              const next = savedDocuments.filter((d) => d.id !== docId);
              persistSavedDocs(next);
            }}
            onReEditScan={handleReEditSavedDoc}
            onRebuildPdf={handleRebuildPdfSavedDoc}
            onStartNewScan={() => setActiveTab('kamera')}
          />
        )}

        {activeTab === 'pengaturan' && (
          <SettingsView
            settings={settings}
            savedCount={savedDocuments.length}
            onUpdateSettings={setSettings}
            onResetAllData={async () => {
              const seeded = await generateInitialSavedDocuments();
              persistSavedDocs(seeded);
            }}
            onOpenApkGuide={() => setShowApkGuideModal(true)}
          />
        )}
      </main>

      <OfflineIndicator />
      {showApkGuideModal && <ApkGuideModal onClose={() => setShowApkGuideModal(false)} />}

      {/* Mobile Bottom Tab Bar (56px height + 56px top header = 112px / 844px = 13.2% <= 15% Sticky Cap) */}
      <nav
        aria-label="Navigasi Bawah"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('beranda')}
          className={`h-full flex flex-col items-center justify-center min-w-0 ${
            activeTab === 'beranda'
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ScanLine className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 truncate max-w-full px-1">Beranda</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('kamera')}
          className={`h-full flex flex-col items-center justify-center min-w-0 ${
            activeTab === 'kamera'
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Camera className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 truncate max-w-full px-1">Kamera</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('galeri')}
          className={`h-full flex flex-col items-center justify-center min-w-0 ${
            activeTab === 'galeri'
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ImageIcon className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 truncate max-w-full px-1">Galeri</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dokumen')}
          className={`h-full flex flex-col items-center justify-center min-w-0 ${
            activeTab === 'dokumen'
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FolderOpen className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 truncate max-w-full px-1">Dokumen</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pengaturan')}
          className={`h-full flex flex-col items-center justify-center min-w-0 ${
            activeTab === 'pengaturan'
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 truncate max-w-full px-1">Pengaturan</span>
        </button>
      </nav>
    </div>
  );
}
