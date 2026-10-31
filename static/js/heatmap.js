// Heatmapa pozycji graczy (dla rundy albo całego meczu).
import { state, $ } from './state.js';
import { SIZE } from './canvas.js';
import { worldToCanvas, onCurrentLevel } from './geometry.js';

const GRID = 256;                               // rozdzielczość siatki
const COLORS = [                                // paleta: zimne -> gorące
  [0, [30, 60, 255]],
  [0.33, [30, 220, 140]],
  [0.66, [255, 235, 60]],
  [1, [255, 40, 30]],
];

let cacheKey = '';
let cacheCanvas = null;

// Wymusza ponowne przeliczenie (np. po zmianie rundy lub ustawień)
export function invalidateHeatmap() {
  cacheKey = '';
}

function colorAt(t) {
  for (let i = 1; i < COLORS.length; i++) {
    if (t <= COLORS[i][0]) {
      const [t0, c0] = COLORS[i - 1];
      const [t1, c1] = COLORS[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return COLORS[COLORS.length - 1][1];
}

// Dodaje do siatki "plamkę" (rozmyty punkt) wokół pozycji gracza
function addBlob(density, gx, gy) {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      density[y * GRID + x] += Math.exp(-(dx * dx + dy * dy) / 4);
    }
  }
}

// Zwraca canvas z heatmapą albo null, gdy heatmapa jest wyłączona
export function getHeatmapCanvas() {
  const scope = $('#hm').value;                 // 'off' | 'round' | 'match'
  if (scope === 'off') return null;

  const radarLoaded = state.radar.main && state.radar.main.complete ? 1 : 0;
  const key = [scope, scope === 'round' ? state.roundIndex : '', state.level, radarLoaded].join('|');
  if (key === cacheKey) return cacheCanvas;

  const density = new Float32Array(GRID * GRID);
  const rounds = scope === 'round' ? [state.round] : state.data.rounds;
  for (const round of rounds) {
    for (const [, rows] of round.frames) {
      for (const p of rows) {
        if (p[3] <= 0 || !onCurrentLevel(p[6])) continue;
        const [x, y] = worldToCanvas(p[1], p[2]);
        addBlob(density, Math.round((x / SIZE) * GRID), Math.round((y / SIZE) * GRID));
      }
    }
  }

  let max = 0;
  for (const v of density) if (v > max) max = v;
  const reference = max * 0.55 || 1;            // 55% maksimum = "najgorętszy" kolor

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID;
  const g = canvas.getContext('2d');
  const image = g.createImageData(GRID, GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    const t = Math.min(1, density[i] / reference);
    if (t < 0.04) continue;
    const [r, gr, b] = colorAt(t);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = gr;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = Math.min(255, 60 + t * 190);
  }
  g.putImageData(image, 0, 0);

  cacheKey = key;
  cacheCanvas = canvas;
  return canvas;
}
