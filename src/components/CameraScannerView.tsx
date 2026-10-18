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
} from 'lucide-react';
import {
  QuadCorners,
  Point2D,
  DEFAULT_CORNERS,
  FULL_FRAME_CORNERS,
  orderQuadCorners,
  clamp,
} from '../utils/scannerLogic.ts';
import {
  SAMPLE_GALLERY_TEMPLATES,
  SamplePhotoTemplate,
  renderSampleDocumentPhoto,
} from '../utils/canvasProcessor.ts';

interface CameraScannerViewProps {
  autoDetectEnabled: boolean;
  onCaptureConfirmed: (rawDataUrl: string, detectedCorners: QuadCorners, label: string) => void;
  onCancel: () => void;
}

export const CameraScannerView: React.FC<CameraScannerViewProps> = ({
  autoDetectEnabled,
  onCaptureConfirmed,
  onCancel,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<SamplePhotoTemplate>(
    SAMPLE_GALLERY_TEMPLATES[0]
  );
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [autoDetect, setAutoDetect] = useState<boolean>(autoDetectEnabled);
  const [useLiveWebcam, setUseLiveWebcam] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const [step, setStep] = useState<'viewfinder' | 'confirm'>('viewfinder');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string>('');
  const [corners, setCorners] = useState<QuadCorners>(SAMPLE_GALLERY_TEMPLATES[0].defaultCorners);
  const [activeCornerKey, setActiveCornerKey] = useState<keyof QuadCorners | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef<boolean>(true);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const [viewfinderUrl, setViewfinderUrl] = useState<string>(() =>
    renderSampleDocumentPhoto(SAMPLE_GALLERY_TEMPLATES[0], false)
  );

  useEffect(() => {
    const url = renderSampleDocumentPhoto(selectedTemplate, flashOn);
    setViewfinderUrl(url);
    if (step === 'viewfinder') {
      setCorners(autoDetect ? selectedTemplate.defaultCorners : DEFAULT_CORNERS);
    }
  }, [selectedTemplate, flashOn, autoDetect, step]);

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
      setWebcamError('Kamera hanya bisa dibuka lewat HTTPS. Menggunakan simulasi kamera kertas.');
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
      setUseLiveWebcam(true);
    } catch {
      setWebcamError('Kamera perangkat tidak terdeteksi atau izin ditolak. Menggunakan simulasi kamera kertas.');
      setUseLiveWebcam(false);
    }
  }, []);

  const handleToggleWebcam = async () => {
    if (useLiveWebcam) {
      stopWebcam();
      setUseLiveWebcam(false);
      setWebcamError(null);
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

  const handleTakePhoto = () => {
    if (useLiveWebcam && videoRef.current && videoRef.current.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setCapturedDataUrl(dataUrl);
        setCorners(autoDetect ? DEFAULT_CORNERS : FULL_FRAME_CORNERS);
        setStep('confirm');
        return;
      }
    }

    const url = renderSampleDocumentPhoto(selectedTemplate, flashOn);
    setCapturedDataUrl(url);
    setCorners(autoDetect ? selectedTemplate.defaultCorners : FULL_FRAME_CORNERS);
    setStep('confirm');
  };

  const handleRetake = () => {
    setStep('viewfinder');
    setCapturedDataUrl('');
  };

  const handleConfirmPhoto = () => {
    const ordered = orderQuadCorners([
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ]);
    onCaptureConfirmed(capturedDataUrl || viewfinderUrl, ordered, selectedTemplate.title);
  };

  const updateCornerFromPointer = (clientX: number, clientY: number, key: keyof QuadCorners) => {
    const container = previewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const normX = clamp((clientX - rect.left) / rect.width, 0.02, 0.98);
    const normY = clamp((clientY - rect.top) / rect.height, 0.02, 0.98);

    setCorners((prev) => ({
      ...prev,
      [key]: { x: Number(normX.toFixed(3)), y: Number(normY.toFixed(3)) },
    }));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeCornerKey) return;
    updateCornerFromPointer(e.clientX, e.clientY, activeCornerKey);
  };

  const handlePointerUp = () => {
    if (activeCornerKey) {
      setActiveCornerKey(null);
    }
  };

  const isLowLightWarning = selectedTemplate.lightingCondition === 'redup' && !flashOn;

  const polygonPoints = `${corners.topLeft.x * 100},${corners.topLeft.y * 100} ${
    corners.topRight.x * 100
  },${corners.topRight.y * 100} ${corners.bottomRight.x * 100},${
    corners.bottomRight.y * 100
  } ${corners.bottomLeft.x * 100},${corners.bottomLeft.y * 100}`;

  const cornerLabels: { key: keyof QuadCorners; name: string }[] = [
    { key: 'topLeft', name: 'Kiri Atas' },
    { key: 'topRight', name: 'Kanan Atas' },
    { key: 'bottomRight', name: 'Kanan Bawah' },
    { key: 'bottomLeft', name: 'Kiri Bawah' },
  ];

  const shortTemplateNames: Record<string, string> = {
    'sample-faktur': 'Faktur',
    'sample-kontrak': 'Kontrak',
    'sample-struk': 'Struk',
    'sample-catatan': 'Catatan',
    'sample-redup': 'Redup',
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Compact Android Header Bar */}
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
          <button
            type="button"
            onClick={() => setFlashOn((prev) => !prev)}
            aria-pressed={flashOn}
            aria-label={flashOn ? 'Flash Aktif' : 'Gunakan Flash'}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors ${
              flashOn
                ? 'bg-amber-400 text-slate-950 border-amber-400'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
            }`}
          >
            {flashOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{flashOn ? 'Flash On' : 'Flash'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleWebcam}
            aria-label="Kamera Live"
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 flex items-center gap-1"
          >
            <Video className="w-4 h-4 text-teal-600" />
            <span>{useLiveWebcam ? 'Simulasi' : 'Kamera HP'}</span>
          </button>
        </div>
      </div>

      {/* Low-Light or Webcam Alert */}
      {(webcamError || isLowLightWarning) && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            {webcamError ||
              'Cahaya kertas terdeteksi redup. Nyalakan Flash di atas atau gunakan fitur Kurangi Bayangan.'}
          </span>
        </div>
      )}

      {/* Main Camera Card */}
      <div className="bg-slate-900 rounded-2xl p-3 sm:p-5 border border-slate-800 space-y-3">
        {/* Status Row */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span className="font-semibold text-white truncate min-w-0">
            {selectedTemplate.title}
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

        {/* Camera Viewfinder / Photo Canvas */}
        <div
          ref={previewContainerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative w-full max-w-[360px] sm:max-w-[400px] mx-auto aspect-[4/5] max-h-[44vh] sm:max-h-[420px] rounded-xl overflow-hidden bg-slate-950 select-none touch-none border border-slate-800"
        >
          {step === 'viewfinder' && useLiveWebcam ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={step === 'confirm' ? capturedDataUrl : viewfinderUrl}
              alt="Pratinjau Kertas Dokumen"
              referrerPolicy="no-referrer"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* SVG Edge Quad Frame */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <polygon
              points={polygonPoints}
              fill="rgba(20, 184, 166, 0.16)"
              stroke="#14b8a6"
              strokeWidth="0.9"
              strokeDasharray={step === 'viewfinder' ? '2.5,1.5' : 'none'}
            />
          </svg>

          {/* 4 Draggable Corner Handles */}
          {cornerLabels.map(({ key, name }) => {
            const pt: Point2D = corners[key];
            return (
              <button
                key={key}
                type="button"
                aria-label={`Sudut ${name}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveCornerKey(key);
                }}
                style={{
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full focus:outline-none cursor-grab active:cursor-grabbing"
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 border-white shadow-md transition-transform ${
                    activeCornerKey === key ? 'bg-amber-400 scale-125' : 'bg-teal-500'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Helper Hint & Quick Corner Reset */}
        <div className="flex items-center justify-between gap-2 max-w-[400px] mx-auto pt-0.5">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            Geser 4 titik sudut kertas
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setCorners(selectedTemplate.defaultCorners)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
            >
              Pas Kertas
            </button>
            <button
              type="button"
              onClick={() => setCorners(FULL_FRAME_CORNERS)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Penuh</span>
            </button>
          </div>
        </div>

        {/* Sample Paper Switcher (Simple 5-button grid) */}
        <div className="max-w-[420px] mx-auto pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1.5">Contoh Kertas:</div>
          <div className="grid grid-cols-5 gap-1">
            {SAMPLE_GALLERY_TEMPLATES.map((tpl) => {
              const active = tpl.id === selectedTemplate.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    if (step === 'confirm') {
                      setCapturedDataUrl(renderSampleDocumentPhoto(tpl, flashOn));
                      setCorners(tpl.defaultCorners);
                    }
                  }}
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

        {/* Primary Shutter / Confirm Buttons */}
        <div className="max-w-[420px] mx-auto pt-2">
          {step === 'viewfinder' ? (
            <button
              type="button"
              onClick={handleTakePhoto}
              className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-transform"
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
                <span>Konfirmasi Hasil Foto</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
