import React, { useRef, useState } from 'react';
import { Point2D, QuadCorners, clamp } from '../utils/scannerLogic.ts';

interface CornerEditorProps {
  src: string;
  corners: QuadCorners;
  onChange: (corners: QuadCorners) => void;
  /** Tailwind max-height class for the image, e.g. "max-h-[60vh]". */
  maxHeightClass?: string;
}

const KEYS: (keyof QuadCorners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const LABELS: Record<keyof QuadCorners, string> = {
  topLeft: 'Kiri Atas',
  topRight: 'Kanan Atas',
  bottomRight: 'Kanan Bawah',
  bottomLeft: 'Kiri Bawah',
};
// How close (in CSS px) a touch must land to grab a corner.
const GRAB_RADIUS = 70;
const LOUPE_SIZE = 110;
const LOUPE_ZOOM = 2.5;

/**
 * Shows a photo at its real aspect ratio with four draggable corners.
 *
 * A touch anywhere near a corner grabs it, and the corner then follows the
 * finger's movement rather than jumping under it, so the finger never hides
 * the point being placed. A magnifier shows the area around the corner.
 */
export const CornerEditor: React.FC<CornerEditorProps> = ({
  src,
  corners,
  onChange,
  maxHeightClass = 'max-h-[60vh]',
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    key: keyof QuadCorners;
    pointerId: number;
    startX: number;
    startY: number;
    startCorner: Point2D;
  } | null>(null);
  const [activeKey, setActiveKey] = useState<keyof QuadCorners | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box || dragRef.current) return;
    const rect = box.getBoundingClientRect();
    let nearest: keyof QuadCorners | null = null;
    let nearestDist = Infinity;
    for (const key of KEYS) {
      const px = rect.left + corners[key].x * rect.width;
      const py = rect.top + corners[key].y * rect.height;
      const dist = Math.hypot(e.clientX - px, e.clientY - py);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = key;
      }
    }
    if (!nearest || nearestDist > GRAB_RADIUS) return;
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    dragRef.current = {
      key: nearest,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCorner: corners[nearest],
    };
    setActiveKey(nearest);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box || e.pointerId !== drag.pointerId) return;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clamp(drag.startCorner.x + (e.clientX - drag.startX) / rect.width, 0, 1);
    const y = clamp(drag.startCorner.y + (e.clientY - drag.startY) / rect.height, 0, 1);
    onChange({ ...corners, [drag.key]: { x, y } });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setActiveKey(null);
  };

  const poly = KEYS.map((k) => `${corners[k].x * 100},${corners[k].y * 100}`).join(' ');
  const active = activeKey ? corners[activeKey] : null;
  // Keep the magnifier on the side away from the corner being dragged.
  const loupeOnRight = active ? active.x < 0.5 : true;

  return (
    <div className="w-full flex justify-center">
      <div
        ref={boxRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative inline-block select-none touch-none"
      >
        <img
          src={src}
          alt="Foto kertas, geser 4 titik sudut"
          draggable={false}
          className={`block w-auto h-auto max-w-full ${maxHeightClass} rounded-lg pointer-events-none`}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        >
          <polygon
            points={poly}
            fill="rgba(20, 184, 166, 0.18)"
            stroke="#14b8a6"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {KEYS.map((key) => (
          <span
            key={key}
            aria-label={`Sudut ${LABELS[key]}`}
            style={{ left: `${corners[key].x * 100}%`, top: `${corners[key].y * 100}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md pointer-events-none transition-[width,height] ${
              activeKey === key ? 'w-4 h-4 bg-amber-400' : 'w-7 h-7 bg-teal-500/90'
            }`}
          />
        ))}

        {active && boxRef.current && (
          <Loupe
            src={src}
            point={active}
            boxWidth={boxRef.current.clientWidth}
            boxHeight={boxRef.current.clientHeight}
            onRight={loupeOnRight}
          />
        )}
      </div>
    </div>
  );
};

const Loupe: React.FC<{
  src: string;
  point: Point2D;
  boxWidth: number;
  boxHeight: number;
  onRight: boolean;
}> = ({ src, point, boxWidth, boxHeight, onRight }) => {
  const bgW = boxWidth * LOUPE_ZOOM;
  const bgH = boxHeight * LOUPE_ZOOM;
  const bgX = LOUPE_SIZE / 2 - point.x * bgW;
  const bgY = LOUPE_SIZE / 2 - point.y * bgH;
  return (
    <div
      className={`absolute top-2 ${onRight ? 'right-2' : 'left-2'} rounded-full border-[3px] border-white shadow-xl overflow-hidden pointer-events-none bg-slate-900`}
      style={{
        width: LOUPE_SIZE,
        height: LOUPE_SIZE,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat: 'no-repeat',
      }}
    >
      <span className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-400/90" />
      <span className="absolute top-1/2 left-0 right-0 h-px bg-amber-400/90" />
    </div>
  );
};
