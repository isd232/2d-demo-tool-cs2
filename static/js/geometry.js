import { state, $ } from './state.js';
import { SIZE } from './canvas.js';

export function worldToCanvas(x, y) {
  const { data, radar } = state;
  const calibration = data.map_data;
  if (radar.main && radar.main.complete && calibration) {
    return [
      ((x - calibration.pos_x) / calibration.scale) * SIZE / 1024,
      ((calibration.pos_y - y) / calibration.scale) * SIZE / 1024,
    ];
  }
  const b = data.bounds;
  const pad = 60;
  const span = Math.max(b.maxx - b.minx, b.maxy - b.miny) || 1;
  return [
    pad + ((x - b.minx) / span) * (SIZE - 2 * pad),
    SIZE - pad - ((y - b.miny) / span) * (SIZE - 2 * pad),
  ];
}

export function worldLength(units) {
  const a = worldToCanvas(0, 0);
  const b = worldToCanvas(units, 0);
  return Math.abs(b[0] - a[0]);
}

const shortestAngle = (from, to) => ((to - from + 540) % 360) - 180;

export function playersAt(tick) {
  const { round, data } = state;
  const frames = round.frames;
  if (!frames.length) return [];
  if (frames.length < 2) return frames[0][1];

  const i = Math.min(frames.length - 2, Math.max(0, Math.floor((tick - round.start) / data.step)));
  const [tickA, rowsA] = frames[i];
  const [tickB, rowsB] = frames[i + 1];
  const k = Math.min(1, Math.max(0, (tick - tickA) / (tickB - tickA || 1)));
  const nextById = new Map(rowsB.map((row) => [row[0], row]));

  return rowsA.map((a) => {
    const b = nextById.get(a[0]);
    if (b && a[3] > 0 && b[3] > 0) {
      return [
        a[0],
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
        a[3],
        a[4] + shortestAngle(a[4], b[4]) * k,
        a[5],
        a[6] + (b[6] - a[6]) * k,
      ];
    }
    return k > 0.5 && b ? b : a;
  });
}

export const levelOfZ = (z) => (state.data.lower_max != null && z <= state.data.lower_max ? 1 : 0);

export function chooseLevel(players) {
  const manual = $('#lvl').value;
  if (manual !== 'auto') return Number(manual);
  const alive = players.filter((p) => p[3] > 0);
  if (!alive.length) return state.level;
  const downstairs = alive.filter((p) => levelOfZ(p[6])).length;
  return downstairs > alive.length / 2 ? 1 : 0;
}

export const onCurrentLevel = (z) => !state.data.has_lower || levelOfZ(z || 0) === state.level;
