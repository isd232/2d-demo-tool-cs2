import { state } from './state.js';
import { ctx } from './canvas.js';
import { onCurrentLevel } from './geometry.js';

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function shorten(name, limit) {
  return name.length > limit ? name.slice(0, limit - 1) + '\u2026' : name;
}

export function drawPlayerLabels(drawn, scale) {
  ctx.save();
  ctx.font = `${12 * scale}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3 * scale;
  const occupied = [];
  const icons = drawn.map((d) => ({
    left: d.x - d.radius - 2 * scale,
    right: d.x + d.radius + 2 * scale,
    top: d.y - d.radius - 2 * scale,
    bottom: d.y + d.radius + 2 * scale,
  }));

  for (const d of [...drawn].sort((a, b) => a.p[0] - b.p[0])) {
    if (!onCurrentLevel(d.p[6])) continue;
    const name = state.data.players[d.p[0]] || '?';
    const nearby = drawn.some((other) => other !== d && Math.hypot(other.x - d.x, other.y - d.y) < 80 * scale);
    const candidates = nearby ? [shorten(name, 9), shorten(name, 5)] : [name, shorten(name, 12), shorten(name, 6)];
    let selected = null;
    for (const text of [...new Set(candidates)]) {
      const width = ctx.measureText(text).width + 6 * scale;
      const height = 15 * scale;
      const gap = d.radius + 7 * scale;
      const positions = [
        [d.x, d.y - gap],
        [d.x, d.y + gap + 10 * scale],
        [d.x + gap + width / 2, d.y + 4 * scale],
        [d.x - gap - width / 2, d.y + 4 * scale],
      ];
      for (const [x, y] of positions) {
        const rect = { left: x - width / 2, right: x + width / 2, top: y - height, bottom: y + 3 * scale };
        if (occupied.some((r) => overlaps(rect, r)) || icons.some((r) => overlaps(rect, r))) continue;
        selected = { text, x, y, rect };
        break;
      }
      if (selected) break;
    }
    if (!selected) continue;
    occupied.push(selected.rect);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(selected.text, selected.x, selected.y);
    ctx.fillText(selected.text, selected.x, selected.y);
  }
  ctx.restore();
}
