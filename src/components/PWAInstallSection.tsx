import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  Terminal,
  Package,
  WifiOff,
  X,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Mode Offline Aktif — Pemindaian &amp; PDF tetap berjalan di perangkat.</span>
    </div>
  );
};

interface ApkGuideModalProps {
  onClose: () => void;
}

export const ApkGuideModal: React.FC<ApkGuideModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const currentUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://scankertas.app';

  const capacitorCommands = `npm install
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android`;

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleCopyCmd = () => {
    navigator.clipboard?.writeText(capacitorCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panduan Buat APK Android & Instal Aplikasi"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-5 h-5 text-teal-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Cara Pasang &amp; Buat APK Android
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Panduan APK"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300">
          {/* Method 1: PWABuilder (.APK / .AAB generator) */}
          <div className="p-3.5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/80 space-y-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-600 shrink-0" />
              <span>1. Buat File .APK Tanpa Coding (PWABuilder)</span>
            </h3>
            <ol className="list-decimal list-inside space-y-1 font-medium text-slate-800 dark:text-slate-200">
              <li>Salin link aplikasi di bawah ini.</li>
              <li>Buka <strong>pwabuilder.com</strong> lalu tempelkan link tersebut.</li>
              <li>Pilih <strong>Package for Stores → Android → Download APK</strong>.</li>
            </ol>

            <div className="flex items-center gap-2 pt-1 min-w-0">
              <input
                type="text"
                readOnly
                value={currentUrl}
                aria-label="URL Aplikasi untuk PWABuilder"
                className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-1 shrink-0"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          {/* Method 2: Direct PWA Install on Android / Desktop */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-teal-600 shrink-0" />
              <span>2. Pasang Langsung dari Chrome Android</span>
            </h3>
            <p className="leading-relaxed">
              Ketuk menu titik tiga di pojok kanan atas Chrome Android lalu pilih{' '}
              <strong>&quot;Instal aplikasi&quot;</strong> atau{' '}
              <strong>&quot;Tambahkan ke Layar Utama&quot;</strong>.
            </p>
            {isInstalled ? (
              <div className="text-teal-600 dark:text-teal-400 font-bold">
                ✓ Aplikasi sudah terpasang di perangkat.
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Instal Aplikasi Sekarang</span>
              </button>
            ) : isIOS ? (
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                Safari iOS: Ketuk tombol <strong>Share</strong> lalu pilih{' '}
                <strong>Add to Home Screen</strong>.
              </div>
            ) : null}
          </div>

          {/* Method 3: Capacitor CLI + Android Studio */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                <Terminal className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="truncate">3. Build via PowerShell &amp; Android Studio</span>
              </h3>
              <button
                type="button"
                onClick={handleCopyCmd}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1 shrink-0"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300">
              <li>
                Unduh ZIP proyek ini dari menu <strong>Download / Export</strong> di pojok kanan atas AI Studio, lalu <strong>Extract (Unzip)</strong> foldernya di komputer Anda.
              </li>
              <li>
                Buka folder hasil ekstrak tersebut di File Explorer (pastikan di dalamnya terlihat file <code>package.json</code> dan <code>capacitor.config.json</code>), lalu <strong>klik kanan → Open in Terminal / PowerShell</strong>.
              </li>
              <li>
                Setelah berada di dalam folder proyek (bukan di <code>C:\Users\Van&gt;</code>), jalankan perintah ini:
              </li>
            </ol>
            <pre className="p-2.5 rounded-xl bg-slate-950 text-teal-300 font-mono text-[11px] overflow-x-auto leading-relaxed">
              {capacitorCommands}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
