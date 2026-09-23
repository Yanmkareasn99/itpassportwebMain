import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Hand, ZoomIn, ZoomOut } from 'lucide-react';

interface ZoomableImagePreviewProps {
  src: string;
  alt: string;
  labels: {
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
    moveTool: string;
  };
}

interface PanStart {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

export default function ZoomableImagePreview({ src, alt, labels }: ZoomableImagePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<PanStart | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const start = panStartRef.current;
    const viewport = viewportRef.current;
    if (!start || !viewport || start.pointerId !== event.pointerId) return;
    viewport.scrollLeft = start.scrollLeft - (event.clientX - start.x);
    viewport.scrollTop = start.scrollTop - (event.clientY - start.y);
  }

  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    panStartRef.current = null;
    setPanning(false);
  }

  return (
    <div className="flex h-[min(38rem,65vh)] min-h-72 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-slate-100">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700">
          <Hand className="h-4 w-4" />
          {labels.moveTool}
        </span>
        <button
          type="button"
          onClick={() => setZoom(current => Math.max(0.5, current - 0.25))}
          disabled={zoom <= 0.5}
          aria-label={labels.zoomOut}
          title={labels.zoomOut}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label={labels.resetZoom}
          title={labels.resetZoom}
          className="min-w-16 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom(current => Math.min(3, current + 0.25))}
          disabled={zoom >= 3}
          aria-label={labels.zoomIn}
          title={labels.zoomIn}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`min-h-0 flex-1 touch-none overflow-auto p-2 select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
      >
        <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
          <img src={src} alt={alt} draggable={false} className="block h-auto w-full" />
        </div>
      </div>
    </div>
  );
}
