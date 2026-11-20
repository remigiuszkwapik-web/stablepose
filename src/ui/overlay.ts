import { config } from '../config';
import { DRAWN_POINTS, SKELETON } from '../analysis/landmarks';
import type { PoseFrame } from '../analysis/types';

export interface OverlayStyle {
  /** Punkte, die hervorgehoben werden (z. B. aktiver Fehler). */
  highlight?: Set<number>;
}

const STEEL = '#9DA2A6';
const SIGNAL = '#F0684C';

/** Zeichnet das Skelett in Quellbild-Pixeln. Die Canvas wird per CSS auf das Video gelegt. */
export function drawSkeleton(canvas: HTMLCanvasElement, frame: PoseFrame | null, style: OverlayStyle = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (frame && (canvas.width !== frame.width || canvas.height !== frame.height)) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pts = frame?.image;
  if (!pts) return;

  const unit = Math.max(canvas.width, canvas.height) / 640; // Linienstärke unabhängig von Auflösung
  const faint = config.pose.faintVisibility;
  const hl = style.highlight ?? new Set<number>();

  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    const p = pts[a];
    const q = pts[b];
    const vis = Math.min(p.v, q.v);
    const isHl = hl.has(a) && hl.has(b);
    ctx.globalAlpha = vis < faint ? 0.25 : 0.9;
    ctx.strokeStyle = isHl ? SIGNAL : STEEL;
    ctx.lineWidth = (isHl ? 3 : 2) * unit;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  for (const i of DRAWN_POINTS) {
    const p = pts[i];
    const isHl = hl.has(i);
    ctx.globalAlpha = p.v < faint ? 0.25 : 1;
    ctx.fillStyle = isHl ? SIGNAL : '#E8E9E8';
    ctx.beginPath();
    ctx.arc(p.x, p.y, (isHl ? 3.5 : 2.5) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
