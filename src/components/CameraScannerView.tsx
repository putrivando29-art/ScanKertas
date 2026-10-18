import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Zap,
  ZapOff,
  RotateCcw,
  Check,
  Maximize2,
  AlertTriangle,
  ScanLine,
  ArrowLeft,
  Video,
  Wand2,
} from 'lucide-react';
import {
  QuadCorners,
  DEFAULT_CORNERS,
  FULL_FRAME_CORNERS,
  orderQuadCorners,
} from '../utils/scannerLogic.ts';
import {
  SAMPLE_GALLERY_TEMPLATES,
  SamplePhotoTemplate,
  renderSampleDocumentPhoto,
  detectCornersInImage,
  detectCornersInSource,
} from '../utils/canvasProcessor.ts';
import { CornerEditor } from './CornerEditor.tsx';

interface CameraScannerViewProps {
  autoDetectEnabled: boolean;
  onCaptureConfirmed: (rawDataUrl: string, detectedCorners: QuadCorners, label: string) => void;
  onCancel: () => void;
}

const LIVE_DETECT_INTERVAL_MS = 300;
// Smaller than the capture-time detection: fast enough to run several times a second.
const LIVE_DETECT_SIDE = 220;

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export const CameraScannerView: React.FC<CameraScannerViewProps> = ({
  autoDetectEnabled,
  onCaptureConfirmed,
  onCancel,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<SamplePhotoTemplate>(
    SAMPLE_GALLERY_TEMPLATES[0]
  );
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [autoDetect, setAutoDetect] = useState<boolean>(autoDetectEnabled);
  const [useLiveWebcam, setUseLiveWebcam] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const [step, setStep] = useState<'viewfinder' | 'confirm'>('viewfinder');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string>('');
  const [corners, setCorners] = useState<QuadCorners>(DEFAULT_CORNERS);
  const [detectedCorners, setDetectedCorners] = useState<QuadCorners | null>(null);
  const [paperFound, setPaperFound] = useState<boolean | null>(null);
  const [liveQuad, setLiveQuad] = useState<QuadCorners | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef<boolean>(true);

  const [viewfinderUrl, setViewfinderUrl] = useState<string>(() =>
    renderSampleDocumentPhoto(SAMPLE_GALLERY_TEMPLATES[0], false)
  );

  useEffect(() => {
    if (!useLiveWebcam) {
      setViewfinderUrl(renderSampleDocumentPhoto(selectedTemplate, flashOn));
    }
  }, [selectedTemplate, flashOn, useLiveWebcam]);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWebcam();
    };
  }, [stopWebcam]);

  const startWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Kamera hanya bisa dibuka lewat HTTPS. Menggunakan contoh kertas.');
      return;
    }
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
      setTorchSupported(Boolean(caps.torch));
      setFlashOn(false);
      setUseLiveWebcam(true);
    } catch {
      setWebcamError('Kamera tidak bisa dibuka atau izin ditolak. Menggunakan contoh kertas.');
      setUseLiveWebcam(false);
    }
  }, []);

  const handleToggleWebcam = async () => {
    if (useLiveWebcam) {
      stopWebcam();
      setUseLiveWebcam(false);
      setWebcamError(null);
      setLiveQuad(null);
      return;
    }
    await startWebcam();
  };

  // The <video> element only mounts once live mode is on (and again after a retake),
  // so the stream is attached here rather than right after getUserMedia resolves.
  useEffect(() => {
    if (useLiveWebcam && step === 'viewfinder' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [useLiveWebcam, step]);

  useEffect(() => {
    startWebcam();
  }, [startWebcam]);

  // Outline the sheet in the live preview so the user can frame it before shooting.
  useEffect(() => {
    if (!useLiveWebcam || step !== 'viewfinder' || !autoDetect) {
      setLiveQuad(null);
      return;
    }
    let timer = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      let elapsed = 0;
      if (video && video.readyState >= 2 && video.videoWidth) {
        const started = performance.now();
        setLiveQuad(
          detectCornersInSource(video, video.videoWidth, video.videoHeight, LIVE_DETECT_SIDE)
        );
        elapsed = performance.now() - started;
      }
      // Slow phones get a longer pause so the preview and buttons stay responsive.
      timer = window.setTimeout(tick, Math.max(LIVE_DETECT_INTERVAL_MS, elapsed * 3));
    };
    timer = window.setTimeout(tick, LIVE_DETECT_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [useLiveWebcam, step, autoDetect]);

  const handleToggleFlash = async () => {
    const next = !flashOn;
    if (useLiveWebcam) {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || !torchSupported) return;
      try {
        await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      } catch {
        return;
      }
    }
    setFlashOn(next);
  };

  const enterConfirm = (dataUrl: string, found: QuadCorners | null) => {
    // Its own history entry, so the phone's back button returns to the viewfinder.
    const st = window.history.state;
    if (st && st.cam !== 'confirm') {
      window.history.pushState({ ...st, i: st.i + 1, cam: 'confirm' }, '');
    }
    setCapturedDataUrl(dataUrl);
    setDetectedCorners(found);
    setPaperFound(autoDetect ? Boolean(found) : null);
    setCorners(autoDetect && found ? found : DEFAULT_CORNERS);
    setStep('confirm');
  };

  const handleTakePhoto = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const video = videoRef.current;
      if (useLiveWebcam && video && video.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const found = autoDetect
            ? detectCornersInSource(canvas, canvas.width, canvas.height)
            : null;
          enterConfirm(dataUrl, found);
          return;
        }
      }
      const url = renderSampleDocumentPhoto(selectedTemplate, flashOn);
      enterConfirm(url, autoDetect ? await detectCornersInImage(url) : null);
    } finally {
      setIsCapturing(false);
    }
  };

  const resetToViewfinder = useCallback(() => {
    setStep('viewfinder');
    setCapturedDataUrl('');
    setPaperFound(null);
  }, []);

  const handleRetake = () => {
    // Going back pops the confirm entry; the popstate listener resets the view.
    if (window.history.state?.cam === 'confirm') window.history.back();
    else resetToViewfinder();
  };

  useEffect(() => {
    // Opened again via back/forward onto a stale confirm entry: there is no photo.
    const st = window.history.state;
    if (st?.cam === 'confirm') {
      const { cam: _cam, ...rest } = st;
      window.history.replaceState(rest, '');
    }
    const onPop = (e: PopStateEvent) => {
      if (e.state?.cam !== 'confirm') resetToViewfinder();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [resetToViewfinder]);

  const handleConfirmPhoto = () => {
    const ordered = orderQuadCorners([
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ]);
    onCaptureConfirmed(
      capturedDataUrl || viewfinderUrl,
      ordered,
      useLiveWebcam ? '' : selectedTemplate.title
    );
  };

  const liveQuadPoints = liveQuad
    ? [liveQuad.topLeft, liveQuad.topRight, liveQuad.bottomRight, liveQuad.bottomLeft]
        .map((p) => `${p.x * 100},${p.y * 100}`)
        .join(' ')
    : '';

  const shortTemplateNames: Record<string, string> = {
    'sample-faktur': 'Faktur',
    'sample-kontrak': 'Kontrak',
    'sample-struk': 'Struk',
    'sample-catatan': 'Catatan',
    'sample-redup': 'Redup',
  };

  const flashUsable = !useLiveWebcam || torchSupported;

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

        <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate text-center min-w-0">
          {step === 'viewfinder' ? 'Pindai Kamera' : 'Atur 4 Sudut Kertas'}
        </h1>

        <div className="flex items-center gap-1.5 shrink-0">
          {flashUsable && step === 'viewfinder' && (
            <button
              type="button"
              onClick={handleToggleFlash}
              aria-pressed={flashOn}
              aria-label={flashOn ? 'Matikan lampu' : 'Nyalakan lampu'}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors ${
                flashOn
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
              }`}
            >
              {flashOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              <span className="hidden sm:inline">Lampu</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleWebcam}
            aria-label={useLiveWebcam ? 'Pakai contoh kertas' : 'Pakai kamera HP'}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 flex items-center gap-1"
          >
            <Video className="w-4 h-4 text-teal-600" />
            <span>{useLiveWebcam ? 'Contoh' : 'Kamera HP'}</span>
          </button>
        </div>
      </div>

      {webcamError && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{webcamError}</span>
        </div>
      )}

      {/* Main Camera Card */}
      <div className="bg-slate-900 rounded-2xl p-3 sm:p-5 border border-slate-800 space-y-3">
        {/* Status Row */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span className="font-semibold text-white truncate min-w-0">
            {step === 'confirm'
              ? 'Geser titik sudut bila perlu'
              : useLiveWebcam
                ? liveQuad
                  ? 'Kertas terdeteksi'
                  : 'Arahkan kamera ke kertas'
                : `Contoh: ${selectedTemplate.title}`}
          </span>
          <button
            type="button"
            onClick={() => setAutoDetect((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 ${
              autoDetect ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>{autoDetect ? 'Tepi Otomatis' : 'Tepi Manual'}</span>
          </button>
        </div>

        {step === 'confirm' && paperFound === false && (
          <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-200 text-xs leading-relaxed">
            Kertas tidak terdeteksi otomatis. Geser 4 titik ke sudut kertas, atau ambil ulang
            dengan latar yang lebih gelap dari kertas.
          </div>
        )}

        {step === 'confirm' ? (
          <CornerEditor
            src={capturedDataUrl}
            corners={corners}
            onChange={setCorners}
            maxHeightClass="max-h-[58vh]"
          />
        ) : (
          <div className="w-full flex justify-center">
            <div className="relative inline-block">
              {useLiveWebcam ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block w-auto h-auto max-w-full max-h-[58vh] rounded-lg bg-slate-950"
                />
              ) : (
                <img
                  src={viewfinderUrl}
                  alt="Contoh foto kertas"
                  draggable={false}
                  className="block w-auto h-auto max-w-full max-h-[58vh] rounded-lg pointer-events-none"
                />
              )}
              {liveQuad && (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={liveQuadPoints}
                    fill="rgba(20, 184, 166, 0.18)"
                    stroke="#2dd4bf"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="flex items-center justify-end gap-1.5 max-w-[420px] mx-auto">
            {detectedCorners && (
              <button
                type="button"
                onClick={() => setCorners(detectedCorners)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Pas Kertas</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCorners(FULL_FRAME_CORNERS)}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Seluruh Foto</span>
            </button>
          </div>
        )}

        {/* Sample paper switcher, only when no real camera is in use */}
        {!useLiveWebcam && step === 'viewfinder' && (
          <div className="max-w-[420px] mx-auto pt-2 border-t border-slate-800">
            <div className="text-[11px] text-slate-400 mb-1.5">Contoh kertas (tanpa kamera):</div>
            <div className="grid grid-cols-5 gap-1">
              {SAMPLE_GALLERY_TEMPLATES.map((tpl) => {
                const active = tpl.id === selectedTemplate.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl)}
                    className={`min-h-[36px] px-1.5 py-1 rounded-lg text-[11px] font-semibold truncate transition-colors ${
                      active
                        ? 'bg-teal-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {shortTemplateNames[tpl.id] || tpl.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Shutter / Confirm Buttons */}
        <div className="max-w-[420px] mx-auto pt-2">
          {step === 'viewfinder' ? (
            <button
              type="button"
              onClick={handleTakePhoto}
              disabled={isCapturing}
              className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-transform"
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>Ambil Foto Dokumen</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleRetake}
                className="min-h-[50px] px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Ambil Ulang</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="min-h-[50px] px-3 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Pakai Foto Ini</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
