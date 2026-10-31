import { state, $ } from './state.js';
import { canvas } from './canvas.js';
import { drawFrame } from './renderer.js';
import { loadAvatars } from './avatars.js';
import { indexCombatEvents } from './combat.js';
import { canvasPoint, zoomAt, panBy, resetView } from './view.js';
import { setupScoreboard } from './scoreboard.js';
import {
  buildRoundTiles, highlightRoundTile, buildTimeline, resetCards, resetKillfeed,
} from './panels.js';

async function uploadDemo(file) {
  $('#msg').textContent = 'Parsing... (large demos may take a moment)';

  const form = new FormData();
  form.append('demo', file);
  const response = await fetch('/api/upload', { method: 'POST', body: form });
  const result = await response.json();
  if (!response.ok) {
    $('#msg').textContent = result.error;
    return;
  }

  const replay = await fetch('/api/replay/' + result.id);
  state.data = await replay.json();
  startPlayer();
}

function setupUploadUi() {
  const dropZone = $('#drop');
  $('#file').onchange = (e) => e.target.files[0] && uploadDemo(e.target.files[0]);
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('over');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('over');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    uploadDemo(e.dataTransfer.files[0]);
  };
  $('#newbtn').onclick = () => location.reload();
}

function loadRadar() {
  const { data, radar } = state;
  radar.main = null;
  radar.lower = null;
  if (data.has_image) {
    radar.main = new Image();
    radar.main.src = `/maps/${data.map}.png`;
  }
  if (data.has_lower) {
    radar.lower = new Image();
    radar.lower.src = `/maps/${data.map}_lower.png`;
  }
}

function startPlayer() {
  const { data } = state;
  $('#drop').style.display = 'none';
  $('#app').style.display = 'grid';
  $('#mapinfo').textContent = data.map;
  $('#nameA').textContent = data.nameA;
  $('#nameB').textContent = data.nameB;
  $('#lvl').hidden = !data.has_lower;

  loadRadar();
  loadAvatars();
  $('#note').textContent = state.radar.main
    ? ''
    : 'Radar not available (pip install awpy, internet required on first use). Showing positions on a grid.';

  buildRoundTiles(selectRound);
  selectRound(0);
  requestAnimationFrame(loop);
}

function selectRound(index) {
  state.roundIndex = index;
  state.round = state.data.rounds[index];
  state.tick = state.round.start;
  indexCombatEvents();
  resetCards();
  resetKillfeed();
  highlightRoundTile(index);
  buildTimeline();
  drawFrame();
}

let lastTimestamp = 0;

function setPlaying(playing) {
  state.playing = playing;
  $('#play').innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
}

function loop(timestamp) {
  if (state.playing) {
    const seconds = (timestamp - lastTimestamp) / 1000;
    state.tick += seconds * state.data.tickrate * state.speed;
    if (state.tick >= state.round.end) {
      state.tick = state.round.end;
      setPlaying(false);
    }
  }
  lastTimestamp = timestamp;
  drawFrame();
  requestAnimationFrame(loop);
}

function setupMapZoom() {
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(canvasPoint(e), Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  let panning = false;
  let last = [0, 0];
  canvas.addEventListener('pointerdown', (e) => {
    panning = true;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('panning');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!panning) return;
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    panBy((e.clientX - last[0]) * scale, (e.clientY - last[1]) * scale);
    last = [e.clientX, e.clientY];
  });
  const stopPanning = () => {
    panning = false;
    canvas.classList.remove('panning');
  };
  canvas.addEventListener('pointerup', stopPanning);
  canvas.addEventListener('pointercancel', stopPanning);

  canvas.addEventListener('dblclick', resetView);
  $('#resetview').onclick = resetView;
}

function setupControls() {
  $('#play').onclick = () => {
    if (state.tick >= state.round.end) state.tick = state.round.start;
    setPlaying(!state.playing);
  };

  document.querySelectorAll('#spd button').forEach((button) => {
    button.onclick = () => {
      state.speed = parseFloat(button.dataset.speed);
      document.querySelectorAll('#spd button').forEach((b) => b.classList.toggle('on', b === button));
    };
  });

  $('#avatars').onchange = (e) => {
    state.showAvatars = e.target.checked;
    resetCards();
  };

  const timeline = $('#tl');
  let dragging = false;
  const seekTo = (e) => {
    const box = timeline.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    state.tick = state.round.start + fraction * (state.round.end - state.round.start);
  };
  timeline.onpointerdown = (e) => {
    dragging = true;
    timeline.setPointerCapture(e.pointerId);
    seekTo(e);
  };
  timeline.onpointermove = (e) => {
    if (dragging) seekTo(e);
  };
  timeline.onpointerup = () => {
    dragging = false;
  };

  addEventListener('keydown', (e) => {
    if (!state.data) return;
    const { tickrate } = state.data;
    if (e.code === 'Space') {
      e.preventDefault();
      $('#play').click();
    }
    if (e.code === 'ArrowRight') state.tick = Math.min(state.round.end, state.tick + 5 * tickrate);
    if (e.code === 'ArrowLeft') state.tick = Math.max(state.round.start, state.tick - 5 * tickrate);
    if (e.code === 'ArrowUp' && state.roundIndex < state.data.rounds.length - 1) selectRound(state.roundIndex + 1);
    if (e.code === 'ArrowDown' && state.roundIndex > 0) selectRound(state.roundIndex - 1);
  });
}

setupUploadUi();
setupControls();
setupMapZoom();
setupScoreboard();
