import { state } from './state.js';
import { canvas, SIZE } from './canvas.js';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export const uiScale = () => 1 / Math.sqrt(state.view.zoom);

function clampView() {
  const v = state.view;
  v.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const minOffset = SIZE * (1 - v.zoom);
  v.x = Math.min(0, Math.max(minOffset, v.x));
  v.y = Math.min(0, Math.max(minOffset, v.y));
}

export function canvasPoint(event) {
  const box = canvas.getBoundingClientRect();
  return [
    ((event.clientX - box.left) * SIZE) / box.width,
    ((event.clientY - box.top) * SIZE) / box.height,
  ];
}

export function zoomAt([px, py], factor) {
  const v = state.view;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const ratio = newZoom / v.zoom;
  v.x = px - (px - v.x) * ratio;
  v.y = py - (py - v.y) * ratio;
  v.zoom = newZoom;
  clampView();
}

export function panBy(dx, dy) {
  state.view.x += dx;
  state.view.y += dy;
  clampView();
}

export function resetView() {
  state.view = { zoom: 1, x: 0, y: 0 };
}

export function applyViewTransform(ctx) {
  const v = state.view;
  ctx.setTransform(v.zoom, 0, 0, v.zoom, v.x, v.y);
}
