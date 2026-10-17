import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { useScreenAnnotation } from "@/features/device/useScreenAnnotation";
import type { WireShape } from "@/features/device/useScreenAnnotation";

type Tool = "pen" | "arrow" | "rect" | "highlight";

interface Point {
  x: number;
  y: number;
}

interface Shape {
  tool: Tool;
  color: string;
  width: number;
  points: Point[]; // pen: many; arrow/rect: [start, end]
}

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: "pen", icon: "gesture", label: "Pen" },
  { tool: "arrow", icon: "arrow_outward", label: "Arrow" },
  { tool: "rect", icon: "rectangle", label: "Box" },
  { tool: "highlight", icon: "highlight", label: "Highlight" },
];

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff"];

/// A frozen-frame annotation surface. Takes an image (a frozen live-view
/// frame or a screenshot), lets the viewer draw on it in their own browser,
/// and saves the marked-up result as a PNG. Purely client-side: nothing is
/// sent to or drawn on the laptop - this annotates the picture you're
/// looking at, not the remote screen.
export function AnnotationOverlay({
  deviceId,
  imageUrl,
  onClose,
}: {
  deviceId: string;
  imageUrl: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [mirror, setMirror] = useState(false);
  const drawing = useRef<Shape | null>(null);
  const { broadcast, clear: clearRemote } = useScreenAnnotation(deviceId);

  const strokeWidth = tool === "highlight" ? 18 : 4;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const all = drawing.current ? [...shapes, drawing.current] : shapes;
    for (const shape of all) {
      drawShape(ctx, shape);
    }
  }, [shapes]);

  // Load the frozen frame, size the canvas to its natural resolution so the
  // saved PNG is full quality, then paint.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw();
    };
    img.src = imageUrl;
  }, [imageUrl, redraw]);

  useEffect(() => {
    redraw();
  }, [shapes, redraw]);

  // When mirroring to the laptop, push the committed shapes (normalized to
  // 0..1 over the screen) whenever they change.
  useEffect(() => {
    if (!mirror) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const wire: WireShape[] = shapes.map((s) => ({
      tool: s.tool,
      color: s.color,
      width: s.width / canvas.width,
      points: s.points.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height })),
    }));
    broadcast(wire);
  }, [shapes, mirror, broadcast]);

  // Toggling mirror off clears the laptop overlay; same on unmount.
  useEffect(() => {
    if (!mirror) return;
    return () => clearRemote();
  }, [mirror, clearRemote]);

  function toCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvasPoint(e);
    drawing.current = { tool, color, width: strokeWidth, points: [p, p] };
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    const p = toCanvasPoint(e);
    if (drawing.current.tool === "pen" || drawing.current.tool === "highlight") {
      drawing.current.points.push(p);
    } else {
      drawing.current.points[1] = p;
    }
    redraw();
  }

  function handlePointerUp(): void {
    if (!drawing.current) return;
    setShapes((prev) => [...prev, drawing.current as Shape]);
    drawing.current = null;
  }

  function undo(): void {
    setShapes((prev) => prev.slice(0, -1));
  }

  function clear(): void {
    setShapes([]);
    if (mirror) clearRemote();
  }

  function download(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sentinel-annotated-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-md backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label="Annotate frame"
          className="surface-card flex max-h-[92vh] w-full max-w-5xl flex-col gap-sm p-md shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div className="flex items-center gap-sm">
              <Icon name="edit" size={20} className="text-primary" />
              <span className="font-mono text-label-mono uppercase tracking-wider text-on-surface">Annotate Frame</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-sm">
            <div className="flex items-center gap-xs rounded-lg bg-surface-container p-xs">
              {TOOLS.map(({ tool: t, icon, label }) => (
                <button
                  key={t}
                  type="button"
                  title={label}
                  onClick={() => setTool(t)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    tool === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-white/5"
                  }`}
                >
                  <Icon name={icon} size={18} />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-xs rounded-lg bg-surface-container p-xs">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-6 w-6 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-white" : "ring-1 ring-white/20"}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-xs">
              <button type="button" title="Undo" onClick={undo} className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high">
                <Icon name="undo" size={18} />
              </button>
              <button type="button" title="Clear" onClick={clear} className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high">
                <Icon name="delete" size={18} />
              </button>
              <button type="button" onClick={download} className="flex items-center gap-xs rounded-md bg-primary px-base py-1.5 font-mono text-label-mono uppercase tracking-wider text-on-primary transition-colors hover:bg-primary/90">
                <Icon name="download" size={16} />
                Save
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMirror((m) => !m)}
              title="Show these annotations on the laptop's own screen"
              className={`flex items-center gap-xs rounded-md px-base py-1.5 font-mono text-label-mono uppercase tracking-wider transition-colors ${
                mirror ? "bg-error text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <Icon name={mirror ? "cast" : "cast"} size={16} />
              {mirror ? "Showing on laptop" : "Show on laptop"}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-black/40">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="max-h-[68vh] w-auto max-w-full cursor-crosshair touch-none"
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.width;
  ctx.globalAlpha = shape.tool === "highlight" ? 0.35 : 1;

  const pts = shape.points;
  if (pts.length === 0) return;

  if (shape.tool === "pen" || shape.tool === "highlight") {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (shape.tool === "rect") {
    const [a, b] = pts;
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (shape.tool === "arrow") {
    const [a, b] = pts;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(12, shape.width * 3);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
