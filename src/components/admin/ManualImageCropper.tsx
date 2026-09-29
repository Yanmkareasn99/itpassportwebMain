import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crop, Hand, Plus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ManualImageCrop } from '../../lib/manualImageCrop';
import { canvasToWebp } from '../../lib/manualImageCrop';

interface CropTarget {
  id: string;
  label: string;
}

interface NormalizedRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ManualImageCropperProps {
  sourceUrl: string;
  title: string;
  targets: CropTarget[];
  labels: {
    instructions: string;
    target: string;
    addCrop: string;
    crops: string;
    empty: string;
    apply: string;
    cancel: string;
    applying: string;
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
    cropTool: string;
    moveTool: string;
  };
  onApply: (crops: ManualImageCrop[]) => Promise<void>;
  onClose: () => void;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function rectangleFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): NormalizedRectangle {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export default function ManualImageCropper({
  sourceUrl,
  title,
  targets,
  labels,
  onApply,
  onClose,
}: ManualImageCropperProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [selection, setSelection] = useState<NormalizedRectangle | null>(null);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? 'question');
  const [crops, setCrops] = useState<ManualImageCrop[]>([]);
  const [creatingCrop, setCreatingCrop] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<'crop' | 'move'>('crop');
  const [panning, setPanning] = useState(false);

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function startSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== 'crop' || creatingCrop || applying) return;
    const point = pointFromEvent(event);
    if (!point) return;
    dragStartRef.current = point;
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    const point = pointFromEvent(event);
    if (point) setSelection(rectangleFromPoints(start, point));
  }

  function finishSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== 'move' || event.button !== 0) return;
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

  async function addCrop() {
    const image = imageRef.current;
    if (!image || !selection || selection.width < 0.005 || selection.height < 0.005) return;
    setCreatingCrop(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      const sourceX = Math.round(selection.x * image.naturalWidth);
      const sourceY = Math.round(selection.y * image.naturalHeight);
      const sourceWidth = Math.max(
        1,
        Math.min(image.naturalWidth - sourceX, Math.round(selection.width * image.naturalWidth)),
      );
      const sourceHeight = Math.max(
        1,
        Math.min(image.naturalHeight - sourceY, Math.round(selection.height * image.naturalHeight)),
      );
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable in this browser.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, sourceWidth, sourceHeight);
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
      const cropped = await canvasToWebp(canvas);
      setCrops(current => [...current, {
        id: crypto.randomUUID(),
        targetId,
        ...cropped,
      }]);
      setSelection(null);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : String(cropError));
    } finally {
      setCreatingCrop(false);
    }
  }

  async function applyCrops() {
    if (!crops.length || applying) return;
    setApplying(true);
    setError('');
    try {
      await onApply(crops);
      onClose();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setApplying(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-gray-800">
              <Crop className="h-5 w-5 text-violet-600" />
              {title}
            </h3>
            <p className="mt-1 text-xs text-gray-500">{labels.instructions}</p>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-slate-100">
            <div className="flex flex-wrap items-center justify-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => setTool('crop')}
                aria-pressed={tool === 'crop'}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tool === 'crop' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Crop className="h-4 w-4" />
                {labels.cropTool}
              </button>
              <button
                type="button"
                onClick={() => setTool('move')}
                aria-pressed={tool === 'move'}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tool === 'move' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Hand className="h-4 w-4" />
                {labels.moveTool}
              </button>
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
              className={`h-[min(58vh,42rem)] touch-none overflow-auto p-2 ${tool === 'move' ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={finishPan}
              onPointerCancel={finishPan}
            >
              <div
                className={`relative mx-auto touch-none select-none ${tool === 'crop' ? 'cursor-crosshair' : ''}`}
                style={{ width: `${zoom * 100}%` }}
                onPointerDown={startSelection}
                onPointerMove={moveSelection}
                onPointerUp={finishSelection}
                onPointerCancel={finishSelection}
              >
                <img ref={imageRef} src={sourceUrl} crossOrigin="anonymous" alt="Crop source" draggable={false} className="block h-auto w-full" />
                {selection && (
                  <div
                    className="pointer-events-none absolute border-2 border-violet-500 bg-violet-400/20 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]"
                    style={{
                      left: `${selection.x * 100}%`,
                      top: `${selection.y * 100}%`,
                      width: `${selection.width * 100}%`,
                      height: `${selection.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <label className="block text-xs font-semibold text-gray-600">
              {labels.target}
              <select value={targetId} onChange={event => setTargetId(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                {targets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void addCrop()}
              disabled={!selection || selection.width < 0.005 || selection.height < 0.005 || creatingCrop || applying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {labels.addCrop}
            </button>

            <div>
              <p className="text-xs font-semibold text-gray-600">{labels.crops} ({crops.length})</p>
              {!crops.length ? (
                <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">{labels.empty}</p>
              ) : (
                <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                  {crops.map(crop => (
                    <div key={crop.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2">
                      <img src={crop.dataUrl} alt="Crop preview" className="h-14 w-20 shrink-0 rounded-lg bg-gray-50 object-contain" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-600">
                        {targets.find(target => target.id === crop.targetId)?.label ?? crop.targetId}
                      </span>
                      <button type="button" onClick={() => setCrops(current => current.filter(item => item.id !== crop.id))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onClose} disabled={applying} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {labels.cancel}
          </button>
          <button type="button" onClick={() => void applyCrops()} disabled={!crops.length || applying} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Check className="h-4 w-4" />
            {applying ? labels.applying : labels.apply}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
