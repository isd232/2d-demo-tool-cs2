import { state, $ } from './state.js';
import { ctx, SIZE } from './canvas.js';
import { playersAt, chooseLevel, onCurrentLevel } from './geometry.js';
import { applyViewTransform } from './view.js';
import {
  drawSmoke, drawMolotov, drawFlash, drawHE, drawKillMark,
  drawTrajectory, drawFovCones, drawPlayers,
} from './effects.js';
import { renderCards, renderHeader, renderKillfeed, movePlayhead } from './panels.js';

function drawBackground() {
  const { radar, level } = state;
  const background = level && radar.lower ? radar.lower : radar.main;
  if (background && background.complete) {
    ctx.drawImage(background, 0, 0, SIZE, SIZE);
    return;
  }
  ctx.strokeStyle = '#1b1f27';
  for (let i = 0; i <= SIZE; i += 75) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, SIZE);
    ctx.moveTo(0, i);
    ctx.lineTo(SIZE, i);
    ctx.stroke();
  }
}

export function drawFrame() {
  const { data, round, tick } = state;
  const tickRate = data.tickrate;
  const secondsSince = (e) => (tick - e.t) / tickRate;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  applyViewTransform(ctx);

  const players = playersAt(tick);
  state.level = data.has_lower ? chooseLevel(players) : 0;

  drawBackground();

  const events = round.events.filter((e) => onCurrentLevel(e.z));

  for (const e of events) if (e.type === 'smoke') drawSmoke(e, secondsSince(e), tickRate);
  for (const e of events) {
    if (e.type === 'molly') drawMolotov(e, secondsSince(e), tickRate);
    else if (e.type === 'he') drawHE(e, secondsSince(e));
    else if (e.type === 'kill' && tick >= e.t) drawKillMark(e);
  }

  drawFovCones(players);
  const trajectoryMode = $('#trj').value;
  for (const trajectory of round.traj || []) drawTrajectory(trajectory, tickRate, trajectoryMode);
  drawPlayers(players);

  for (const e of events) if (e.type === 'flash') drawFlash(e, secondsSince(e));

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  renderCards(players);
  renderHeader();
  renderKillfeed();
  movePlayhead();
}
