import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Sliders,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import {
  AppSettings,
  PaperSizeOption,
  PdfQualityOption,
  formatDefaultFileName,
  DEFAULT_SETTINGS,
} from '../utils/scannerLogic.ts';

interface SettingsViewProps {
  settings: AppSettings;
  savedCount: number;
  onUpdateSettings: (next: AppSettings) => void;
  onResetAllData: () => void;
  onOpenApkGuide: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  savedCount,
  onUpdateSettings,
  onResetAllData,
  onOpenApkGuide,
}) => {
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    onUpdateSettings(next);
    setSavedToast('Pengaturan disimpan.');
    setTimeout(() => setSavedToast(null), 2500);
  };

  const storagePresets = [
    '/Internal/Documents/ScanKertas',
    '/Internal/Download/ScanKertas_PDF',
    '/SDCard/Arsip/ScanKertas',
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            Pengaturan Aplikasi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Tema, kualitas scan, ukuran kertas &amp; instalasi Android
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onUpdateSettings(DEFAULT_SETTINGS);
            setSavedToast('Pengaturan dikembalikan ke standar.');
          }}
          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {savedToast && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-teal-600" />
          <span>Tampilan &amp; Kualitas Default</span>
        </h2>

        {/* Tema Terang / Gelap */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
            Tema Tampilan
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => updateField('theme', 'light')}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                settings.theme === 'light'
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Sun className="w-4 h-4 shrink-0" />
              <span>Tema Terang</span>
            </button>
            <button
              type="button"
              onClick={() => updateField('theme', 'dark')}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Moon className="w-4 h-4 shrink-0" />
              <span>Tema Gelap</span>
            </button>
          </div>
        </div>

        {/* Kualitas Hasil Scan */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
            Kualitas Hasil Scan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['tinggi', 'Tajam'],
                ['sedang', 'Seimbang'],
                ['cepat', 'Cepat'],
              ] as [AppSettings['defaultScanQuality'], string][]
            ).map(([q, label]) => (
              <button
                key={q}
                type="button"
                onClick={() => updateField('defaultScanQuality', q)}
                className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  settings.defaultScanQuality === q
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolusi PDF */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
            Resolusi PDF Default
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['tinggi', '300 DPI'],
                ['sedang', '150 DPI'],
                ['kecil', '72 DPI'],
              ] as [PdfQualityOption, string][]
            ).map(([resKey, resLabel]) => (
              <button
                key={resKey}
                type="button"
                onClick={() => updateField('defaultPdfResolution', resKey)}
                className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  settings.defaultPdfResolution === resKey
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {resLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Ukuran Kertas Default */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
            Ukuran Kertas Default
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['A4', 'Otomatis'] as PaperSizeOption[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => updateField('defaultPaperSize', sz)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  settings.defaultPaperSize === sz
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {sz === 'A4' ? 'Kertas A4' : 'Otomatis'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Storage & Filename Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3.5">
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-teal-600" />
          <span>Nama File &amp; Penyimpanan</span>
        </h2>

        <div>
          <label
            htmlFor="default-prefix-input"
            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1"
          >
            Awalan Nama File Default
          </label>
          <input
            id="default-prefix-input"
            type="text"
            value={settings.defaultFilePrefix}
            onChange={(e) => updateField('defaultFilePrefix', e.target.value)}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
          />
          <p className="text-[11px] text-slate-500 mt-1 font-mono truncate">
            Contoh: {formatDefaultFileName(settings.defaultFilePrefix)}.pdf
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
            Folder Penyimpanan
          </label>
          <div className="space-y-1.5">
            {storagePresets.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => updateField('storageLocation', path)}
                className={`w-full text-left p-2.5 rounded-xl border text-xs font-mono truncate transition-colors ${
                  settings.storageLocation === path
                    ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-600 text-teal-900 dark:text-teal-200 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Privacy & Reset Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>100% Diproses di HP (Offline)</span>
          </span>
          <span className="font-mono text-slate-500">{savedCount} Dokumen</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Seluruh foto kertas dan PDF diproses langsung di perangkat Anda tanpa dikirim ke internet.
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Hapus semua ${savedCount} dokumen? Tindakan ini tidak bisa dibatalkan.`)) {
              onResetAllData();
            }
          }}
          disabled={savedCount === 0}
          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 dark:text-red-400 disabled:opacity-40"
        >
          Hapus Semua Dokumen
        </button>
      </div>
    </div>
  );
};
