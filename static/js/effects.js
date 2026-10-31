import { state } from './state.js';
import { ctx } from './canvas.js';
import { worldToCanvas, worldLength, onCurrentLevel } from './geometry.js';
import {
  SIDE_COLOR, GRENADE_RGB, FOV_LENGTH_UNITS, FOV_DEGREES, SMOKE_TIMER_FROM, MOLLY_TIMER_FROM, smoothstep,
} from './config.js';
import { grenadeImage } from './icons.js';
import { avatarOf } from './avatars.js';
import { fireStrength, hitStrength } from './combat.js';
import { blindStrength, drawBlindOverlay } from './blind.js';
import { uiScale } from './view.js';

const GRENADE_ICON_SIZE = 16;
const AVATAR_RADIUS = 14;
const DOT_RADIUS = 10;

function radialCircle(x, y, radius, stops) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrenadeIcon(kind, side, x, y, size) {
  const img = grenadeImage(kind, side);
  if (!img || !img.complete) return;
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

function drawCountdown(x, y, secondsLeft) {
  const k = uiScale();
  const color = secondsLeft <= 3 ? '#ff6b6b' : secondsLeft <= 5 ? '#ffd24a' : '#ffffff';
  ctx.save();
  ctx.font = `bold ${16 * k}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = color;
  const text = secondsLeft.toFixed(1);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function seededRandom(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const puffCache = new Map();

function smokePuffs(e) {
  const key = `${e.t}|${Math.round(e.x)}|${Math.round(e.y)}`;
  if (puffCache.has(key)) return puffCache.get(key);

  const random = seededRandom(e.t * 31 + e.x * 7 + e.y * 13);
  const puffs = [{ dx: 0, dy: 0, r: 0.66, phase: 0 }];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.6;
    const distance = 0.38 + random() * 0.2;
    puffs.push({
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      r: 0.42 + random() * 0.16,
      phase: random() * Math.PI * 2,
    });
  }
  puffCache.set(key, puffs);
  return puffs;
}

export function drawSmoke(e, age, tickRate) {
  const total = (e.end - e.t) / tickRate;
  if (age < 0 || age > total) return;

  const grow = 1 - Math.pow(1 - Math.min(1, age / 0.9), 3);
  const fade = 1 - smoothstep((age - (total - 3.5)) / 3.5);
  const alpha = 0.6 * fade * (0.3 + 0.7 * grow);
  const [cx, cy] = worldToCanvas(e.x, e.y);
  const radius = worldLength(144) * (0.45 + 0.55 * grow);

  for (const puff of smokePuffs(e)) {
    const wobble = Math.sin(age * 0.9 + puff.phase) * 0.04;
    const x = cx + (puff.dx + wobble) * radius;
    const y = cy + (puff.dy - wobble) * radius;
    const r = puff.r * radius * (1 + wobble);
    radialCircle(x, y, r, [
      [0, `rgba(196,202,212,${alpha})`],
      [0.6, `rgba(176,183,195,${alpha * 0.9})`],
      [0.88, `rgba(130,138,152,${alpha * 0.55})`],
      [1, 'rgba(120,128,142,0)'],
    ]);
  }

  const left = total - age;
  if (left <= SMOKE_TIMER_FROM) drawCountdown(cx, cy, left);
}

export function drawMolotov(e, age, tickRate) {
  const total = (e.end - e.t) / tickRate;
  if (age < 0 || age > total) return;
  const grow = 1 - Math.pow(1 - Math.min(1, age / 0.7), 2);
  const fade = 1 - smoothstep((age - (total - 2)) / 2);
  const flicker = 0.92 + 0.08 * Math.sin(age * 22 + e.x);
  const alpha = 0.88 * fade * flicker;
  const [x, y] = worldToCanvas(e.x, e.y);
  const r = worldLength(130) * (0.35 + 0.65 * grow) * (1 + 0.025 * Math.sin(age * 14));
  radialCircle(x, y, r, [
    [0, `rgba(255,90,60,${alpha * 0.95})`],
    [0.5, `rgba(225,25,20,${alpha * 0.75})`],
    [1, 'rgba(150,0,0,0)'],
  ]);

  const left = total - age;
  if (left <= MOLLY_TIMER_FROM) drawCountdown(x, y, left);
}

export function drawFlash(e, age) {
  const duration = 1.1;
  if (age < 0 || age > duration) return;
  const p = age / duration;
  const alpha = Math.pow(1 - p, 1.6);
  const [x, y] = worldToCanvas(e.x, e.y);
  const r = worldLength(130) * (0.5 + 0.9 * Math.sqrt(p));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  radialCircle(x, y, r, [
    [0, `rgba(255,255,255,${Math.min(1, alpha * 1.4)})`],
    [0.35, `rgba(255,255,235,${alpha * 0.9})`],
    [1, 'rgba(255,255,220,0)'],
  ]);
  radialCircle(x, y, r * 0.45, [[0, `rgba(255,255,255,${alpha})`], [1, 'rgba(255,255,255,0)']]);
  ctx.restore();
}

export function drawHE(e, age) {
  const duration = 0.8;
  if (age < 0 || age > duration) return;
  const p = age / duration;
  const alpha = 1 - p;
  const [x, y] = worldToCanvas(e.x, e.y);
  const r = worldLength(170) * (0.25 + 0.75 * Math.sqrt(p));
  radialCircle(x, y, r, [
    [0, `rgba(255,220,120,${alpha * 0.9})`],
    [0.5, `rgba(255,90,40,${alpha * 0.6})`],
    [1, 'rgba(200,30,10,0)'],
  ]);
}

export function drawKillMark(e) {
  const k = uiScale();
  const [x, y] = worldToCanvas(e.x, e.y);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.moveTo(x - 6 * k, y - 6 * k);
  ctx.lineTo(x + 6 * k, y + 6 * k);
  ctx.moveTo(x + 6 * k, y - 6 * k);
  ctx.lineTo(x - 6 * k, y + 6 * k);
  ctx.stroke();
}

export function drawTrajectory(trajectory, tickRate, mode) {
  const { tick, data, round } = state;
  const k = uiScale();
  const points = trajectory.pts;
  const startTick = points[0][0];
  const landTick = points[points.length - 1][0];
  if (mode === 'off' || tick < startTick) return;

  const secondsAfterLanding = (tick - landTick) / tickRate;
  const keepSeconds = mode === 'trail' ? 5 : 0;
  if (secondsAfterLanding > keepSeconds) return;

  let n = 0;
  while (n < points.length && points[n][0] <= tick) n++;
  const path = points.slice(0, n).map((p) => worldToCanvas(p[1], p[2]));
  if (n > 0 && n < points.length) {
    const a = points[n - 1];
    const b = points[n];
    const t = (tick - a[0]) / (b[0] - a[0] || 1);
    path.push(worldToCanvas(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
  }
  if (path.length < 2) return;

  const inFlight = secondsAfterLanding <= 0;
  const fadeOut = inFlight ? 1 : 1 - smoothstep(secondsAfterLanding / keepSeconds);
  const alpha = fadeOut * (onCurrentLevel(points[points.length - 1][3]) ? 1 : 0.3);
  const rgb = GRENADE_RGB[trajectory.type] || '255,255,255';

  const strokePath = (width, color) => {
    ctx.lineWidth = width * k;
    ctx.strokeStyle = color;
    ctx.beginPath();
    path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(inFlight ? [] : [7 * k, 5 * k]);
  strokePath(5, `rgba(0,0,0,${alpha * 0.6})`);
  strokePath(2.5, `rgba(${rgb},${alpha})`);
  ctx.setLineDash([]);

  if (inFlight) {
    const thrower = data.players.indexOf(trajectory.by);
    const side = round.sides[thrower] || 2;
    const head = path[path.length - 1];
    drawGrenadeIcon(trajectory.type, side, head[0], head[1], GRENADE_ICON_SIZE * k);
  }
}

function drawFov(x, y, yawDegrees, color) {
  const half = (FOV_DEGREES / 2) * Math.PI / 180;
  const angle = (-yawDegrees * Math.PI) / 180;
  const r = worldLength(FOV_LENGTH_UNITS) || 60;

  const gradient = ctx.createRadialGradient(x, y, 3, x, y, r);
  gradient.addColorStop(0, color + '99');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, angle - half, angle + half);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color + '77';
  ctx.lineWidth = uiScale();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle - half) * r * 0.9, y + Math.sin(angle - half) * r * 0.9);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle + half) * r * 0.9, y + Math.sin(angle + half) * r * 0.9);
  ctx.stroke();
}

export function drawFovCones(players) {
  for (const p of players) {
    if (p[3] <= 0) continue;
    ctx.globalAlpha = onCurrentLevel(p[6]) ? 1 : 0.25;
    const [x, y] = worldToCanvas(p[1], p[2]);
    drawFov(x, y, p[4], SIDE_COLOR[p[5]]);
  }
  ctx.globalAlpha = 1;
}

function drawMuzzleFlash(x, y, yawDegrees, strength, iconRadius, k) {
  const angle = (-yawDegrees * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const muzzle = [x + dx * (iconRadius + 4 * k), y + dy * (iconRadius + 4 * k)];
  const tracerEnd = [x + dx * (iconRadius + 70 * k), y + dy * (iconRadius + 70 * k)];

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createLinearGradient(muzzle[0], muzzle[1], tracerEnd[0], tracerEnd[1]);
  gradient.addColorStop(0, `rgba(255,240,170,${strength})`);
  gradient.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.moveTo(muzzle[0], muzzle[1]);
  ctx.lineTo(tracerEnd[0], tracerEnd[1]);
  ctx.stroke();
  radialCircle(muzzle[0], muzzle[1], (6 + 8 * strength) * k, [
    [0, `rgba(255,255,220,${strength})`],
    [1, 'rgba(255,190,60,0)'],
  ]);
  ctx.restore();
}

function drawPlayerIcon(p, x, y, avatar, radius, k) {
  const color = SIDE_COLOR[p[5]];
  const hit = hitStrength(p[0], state.tick);
  const blind = blindStrength(p[0], state.tick);
  const name = state.data.players[p[0]] || '?';

  if (hit > 0) {
    radialCircle(x, y, radius + 14 * k, [
      [0.4, `rgba(255,40,40,${0.75 * hit})`],
      [1, 'rgba(255,40,40,0)'],
    ]);
  }

  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = 'rgba(0,0,0,.9)';
  ctx.beginPath();
  ctx.arc(x, y, radius + 2 * k, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  if (hit > 0) {
    ctx.fillStyle = `rgba(255,0,0,${0.6 * hit})`;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  drawBlindOverlay(ctx, x, y, radius, blind);
  ctx.restore();

  ctx.lineWidth = (avatar ? 3 : 2) * k;
  ctx.strokeStyle = hit > 0.05 ? '#ff3b3b' : avatar ? color : '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, radius - (avatar ? 1 : 0.5) * k, 0, Math.PI * 2);
  ctx.stroke();

  if (!avatar) {
    ctx.fillStyle = blind > 0.5 ? '#1b1f27' : '#ffffff';
    ctx.font = `bold ${11 * k}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.charAt(0).toUpperCase(), x, y + 0.5 * k);
    ctx.textBaseline = 'alphabetic';
  }
}

export function drawPlayers(players) {
  const { data, tick } = state;
  const k = uiScale();

  const drawn = players
    .filter((p) => p[3] > 0)
    .map((p) => {
      const [x, y] = worldToCanvas(p[1], p[2]);
      const avatar = state.showAvatars ? avatarOf(p[0]) : null;
      return { p, x, y, avatar, radius: (avatar ? AVATAR_RADIUS : DOT_RADIUS) * k };
    });

  const priority = (d) => (fireStrength(d.p[0], tick) > 0 || hitStrength(d.p[0], tick) > 0 ? 1e6 : 0);
  drawn.sort((a, b) => priority(a) + a.y - (priority(b) + b.y));

  for (const d of drawn) {
    ctx.globalAlpha = onCurrentLevel(d.p[6]) ? 1 : 0.25;
    const fire = fireStrength(d.p[0], tick);
    if (fire > 0) drawMuzzleFlash(d.x, d.y, d.p[4], fire, d.radius, k);
    drawPlayerIcon(d.p, d.x, d.y, d.avatar, d.radius, k);
  }

  ctx.font = `${13 * k}px system-ui`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3 * k;
  for (const d of drawn) {
    ctx.globalAlpha = onCurrentLevel(d.p[6]) ? 1 : 0.25;
    const label = data.players[d.p[0]];
    ctx.strokeStyle = '#000';
    ctx.strokeText(label, d.x, d.y - d.radius - 6 * k);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, d.x, d.y - d.radius - 6 * k);
  }
  ctx.globalAlpha = 1;
}
