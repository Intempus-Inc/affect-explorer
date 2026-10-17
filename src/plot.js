/** Canvas coordinate rendering adapted from Intempus's original affect explorer. */
import { quadrant } from './data.js';

const QUADRANTS = ['#5b6b8c', '#b0473c', '#4e8d6e', '#c8772e'];
const TYPES = { face: '#c44e52', scene: '#4e8d6e', audio: '#8172b3', other: '#77756a' };

export function clipColor(clip, mode) {
  if (mode === 'type') return TYPES[clip.type];
  if (mode === 'valence') {
    const t = clip.valence;
    const s = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const rgb = t <= 0.5 ? [215 - s * 25, 48 + s * 177, 39 + s * 69] : [190 - s * 137, 225 - s * 72, 108 + s * 139];
    return `rgb(${rgb.map(Math.round).join(',')})`;
  }
  if (mode === 'arousal') {
    const t = clip.arousal;
    const s = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const rgb = t <= 0.5 ? [255 - s * 3, 237 - s * 100, 160 - s * 100] : [252 - s * 72, 137 - s * 100, 60 - s * 45];
    return `rgb(${rgb.map(Math.round).join(',')})`;
  }
  return QUADRANTS[(clip.valence >= 0.5 ? 2 : 0) + (clip.arousal >= 0.5 ? 1 : 0)];
}

export function project(clip, view) {
  return { x: view.x + clip.valence * view.scale, y: view.y + (1 - clip.arousal) * view.scale };
}

export function zoomAt(view, x, y, factor) {
  const scale = Math.max(80, Math.min(5000, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
}

export function nearest(clips, view, x, y, radius = 18) {
  let closest = null;
  let distance = radius;
  for (const clip of clips) {
    const point = project(clip, view);
    const next = Math.hypot(point.x - x, point.y - y);
    if (next < distance) { closest = clip; distance = next; }
  }
  return closest;
}

export class CoordinatePlot {
  constructor(canvas, onSelect, caption) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.caption = caption;
    this.clips = [];
    this.images = new Map();
    this.pointers = new Map();
    this.view = { scale: 400, x: 50, y: 50 };
    this.color = 'quadrant';
    this.display = 'points';
    this.hovered = null;
    this.frame = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    canvas.addEventListener('pointerup', event => this.pointerUp(event));
    canvas.addEventListener('pointercancel', event => this.pointerUp(event, true));
    canvas.addEventListener('lostpointercapture', event => this.pointers.delete(event.pointerId));
    canvas.addEventListener('pointerleave', () => { if (!this.pointers.size) this.hover(null); });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const p = this.position(event);
      this.view = zoomAt(this.view, p.x, p.y, event.deltaY < 0 ? 1.1 : 1 / 1.1);
      this.schedule();
    }, { passive: false });
    canvas.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [30, 0], ArrowRight: [-30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30] }[event.key];
      if (direction) { this.view.x += direction[0]; this.view.y += direction[1]; }
      else if (event.key === '+' || event.key === '=') this.zoom(1.2);
      else if (event.key === '-') this.zoom(1 / 1.2);
      else return;
      event.preventDefault();
      this.schedule();
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    if (!this.initialized) { this.initialized = true; this.reset(); }
    this.schedule();
  }

  reset() {
    if (!this.width || !this.height) return;
    const scale = Math.max(80, Math.min(this.width - 100, this.height - 100));
    this.view = { scale, x: (this.width - scale) / 2, y: (this.height - scale) / 2 };
    this.schedule();
  }

  zoom(factor) {
    if (!this.width || !this.height) return;
    this.view = zoomAt(this.view, this.width / 2, this.height / 2, factor);
    this.schedule();
  }

  update(clips, color, display, clearImages = false) {
    this.clips = clips;
    this.color = color;
    this.display = display;
    if (clearImages) this.images.clear();
    this.hover(null);
    this.schedule();
  }

  position(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const position = this.position(event);
    this.pointers.set(event.pointerId, { ...position, startX: position.x, startY: position.y, moved: false });
    if (this.pointers.size > 1) for (const point of this.pointers.values()) point.moved = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus({ preventScroll: true });
  }

  pointerMove(event) {
    const position = this.position(event);
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      this.hover(nearest(this.clips, this.view, position.x, position.y, this.display === 'thumbnails' ? 26 : 18));
      return;
    }
    const oldPoints = [...this.pointers.values()].map(point => ({ ...point }));
    previous.moved ||= Math.hypot(position.x - previous.startX, position.y - previous.startY) > 5;
    const dx = position.x - previous.x, dy = position.y - previous.y;
    Object.assign(previous, position);
    const points = [...this.pointers.values()];
    if (points.length === 1) {
      this.view.x += dx; this.view.y += dy;
    } else if (points.length === 2) {
      const oldDistance = Math.hypot(oldPoints[0].x - oldPoints[1].x, oldPoints[0].y - oldPoints[1].y);
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const oldX = (oldPoints[0].x + oldPoints[1].x) / 2, oldY = (oldPoints[0].y + oldPoints[1].y) / 2;
      if (oldDistance > 1 && distance > 1) this.view = zoomAt(this.view, oldX, oldY, distance / oldDistance);
      this.view.x += (points[0].x + points[1].x) / 2 - oldX;
      this.view.y += (points[0].y + points[1].y) / 2 - oldY;
    }
    this.hover(null);
    this.schedule();
  }

  pointerUp(event, cancelled = false) {
    const point = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (point && !point.moved && !cancelled) {
      const position = this.position(event);
      const clip = nearest(this.clips, this.view, position.x, position.y, this.display === 'thumbnails' ? 26 : 18);
      if (clip) this.onSelect(clip);
    }
  }

  hover(clip) {
    this.hovered = clip;
    this.caption.textContent = clip ? `${clip.label}: valence ${clip.valence.toFixed(3)}, arousal ${clip.arousal.toFixed(3)}. ${quadrant(clip)}.` : 'Drag to pan. Scroll or pinch to zoom. Select a point or a clip from the list.';
    this.canvas.style.cursor = clip ? 'pointer' : 'grab';
    this.schedule();
  }

  image(path) {
    if (!path) return null;
    if (!this.images.has(path)) {
      const image = new Image();
      this.images.set(path, { image, ready: false });
      image.onload = () => { if (this.images.get(path)?.image === image) this.images.get(path).ready = true; this.schedule(); };
      image.onerror = () => { if (this.images.get(path)?.image === image) this.images.get(path).ready = false; };
      image.src = path;
    }
    const entry = this.images.get(path);
    return entry.ready ? entry.image : null;
  }

  schedule() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
  }

  draw() {
    if (!this.width || !this.height) return;
    const ctx = this.canvas.getContext('2d');
    const view = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = '11px ui-monospace,monospace';
    ctx.fillStyle = '#65645b';
    ctx.lineWidth = 1;
    for (let step = 0; step <= 10; step += 2) {
      const value = step / 10;
      const point = project({ valence: value, arousal: value }, view);
      ctx.strokeStyle = '#ecece6';
      ctx.beginPath(); ctx.moveTo(point.x, view.y); ctx.lineTo(point.x, view.y + view.scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(view.x, point.y); ctx.lineTo(view.x + view.scale, point.y); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(value.toFixed(1), point.x, Math.min(this.height - 25, view.y + view.scale + 18));
      ctx.textAlign = 'right'; ctx.fillText(value.toFixed(1), Math.max(30, view.x - 8), point.y + 4);
    }
    ctx.strokeStyle = '#bfbfb3'; ctx.strokeRect(view.x, view.y, view.scale, view.scale);
    ctx.textAlign = 'center'; ctx.fillText('valence', view.x + view.scale / 2, Math.min(this.height - 8, view.y + view.scale + 36));
    ctx.save(); ctx.translate(Math.max(12, view.x - 40), view.y + view.scale / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('arousal', 0, 0); ctx.restore();
    for (const clip of this.clips) {
      const point = project(clip, view);
      if (point.x < -30 || point.x > this.width + 30 || point.y < -30 || point.y > this.height + 30) continue;
      const color = clipColor(clip, this.color);
      const image = this.display === 'thumbnails' ? this.image(clip.thumbnail) : null;
      ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (image) {
        ctx.drawImage(image, point.x - 20, point.y - 15, 40, 30);
        ctx.strokeRect(point.x - 20, point.y - 15, 40, 30);
      } else {
        ctx.beginPath(); ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = '#55554b'; ctx.lineWidth = 0.5; ctx.stroke();
      }
      if (clip === this.hovered) {
        ctx.strokeStyle = '#292821'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(point.x, point.y, image ? 26 : 11, 0, 2 * Math.PI); ctx.stroke();
      }
    }
  }
}
