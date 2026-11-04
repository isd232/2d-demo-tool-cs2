import { state, $ } from './state.js';
import { canvas } from './canvas.js';
import { JUMP_LEAD_SECONDS } from './config.js';
import { drawFrame } from './renderer.js';
import { loadAvatars } from './avatars.js';
import { indexCombatEvents } from './combat.js';
import { canvasPoint, zoomAt, panBy, resetView } from './view.js';
import { setupScoreboard } from './scoreboard.js';
import { setupEconomy } from './economy.js';
import { showProgress, hideProgress } from './progress.js';
import {
  buildRoundTiles, highlightRoundTile, buildTimeline, resetCards, resetKillfeed,
} from './panels.js';
import './timeline-ui.js';
import './toolbar.js';
import './scoreboard-polish.js';

const UPLOAD_SHARE = 5;
const DOWNLOAD_SHARE = 10;

let busy = false;

function sendFile(file) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) showProgress((e.loaded / e.total) * UPLOAD_SHARE, 'Uploading');
    };
    request.onload = () => {
      let body = {};
      try {
        body = JSON.parse(request.responseText);
      } catch (error) {
        body = {};
      }
      if (request.status >= 200 && request.status < 300) resolve(body);
      else reject(new Error(body.error || 'Upload failed'));
    };
    request.onerror = () => reject(new Error('Network error'));
    const form = new FormData();
    form.append('demo', file);
    request.send(form);
  });
}

async function waitForJob(jobId) {
  const parseShare = 100 - UPLOAD_SHARE - DOWNLOAD_SHARE;
  for (;;) {
    const response = await fetch('/api/progress/' + jobId);
    if (!response.ok) throw new Error('Lost track of the parsing job');
    const job = await response.json();
    showProgress(UPLOAD_SHARE + (job.percent / 100) * parseShare, job.label);
    if (job.state === 'done') return job.id;
    if (job.state === 'error') throw new Error(job.error);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function downloadReplay(id) {
  const base = 100 - DOWNLOAD_SHARE;
  const response = await fetch('/api/replay/' + id);
  if (!response.ok) throw new Error('Could not load the replay');
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body || !total) {
    showProgress(base, 'Loading replay');
    return response.json();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    showProgress(base + (received / total) * DOWNLOAD_SHARE * 0.8, 'Loading replay');
  }
  showProgress(100 - DOWNLOAD_SHARE * 0.2, 'Preparing replay');
  await new Promise((resolve) => setTimeout(resolve, 30));
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function uploadDemo(file) {
  if (busy) return;
  busy = true;
  $('#msg').textContent = '';
  try {
    showProgress(0, 'Uploading');
    const { job } = await sendFile(file);
    const id = await waitForJob(job);
    state.data = await downloadReplay(id);
    showProgress(100, 'Done');
    hideProgress();
    startPlayer();
  } catch (error) {
    hideProgress();
    $('#msg').textContent = error.message;
  } finally {
    busy = false;
  }
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

function jumpToTick(eventTick) {
  const lead = JUMP_LEAD_SECONDS * state.data.tickrate;
  state.tick = Math.max(state.round.start, Math.min(state.round.end, eventTick - lead));
}

const killTicks = (round) => round.events.filter((e) => e.type === 'kill').map((e) => e.t);

function jumpToNextKill() {
  const lead = JUMP_LEAD_SECONDS * state.data.tickrate;
  const next = killTicks(state.round).find((t) => t - lead > state.tick + 1);
  if (next !== undefined) {
    jumpToTick(next);
    return;
  }
  if (state.roundIndex < state.data.rounds.length - 1) {
    selectRound(state.roundIndex + 1);
    const first = killTicks(state.round)[0];
    if (first !== undefined) jumpToTick(first);
  }
}

function jumpToPreviousKill() {
  const lead = JUMP_LEAD_SECONDS * state.data.tickrate;
  const earlier = killTicks(state.round).filter((t) => t - lead < state.tick - 1);
  if (earlier.length) {
    jumpToTick(earlier[earlier.length - 1]);
    return;
  }
  if (state.roundIndex > 0) {
    selectRound(state.roundIndex - 1);
    const kills = killTicks(state.round);
    if (kills.length) jumpToTick(kills[kills.length - 1]);
    else state.tick = state.round.start;
  } else {
    state.tick = state.round.start;
  }
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

function setupKillNavigation() {
  const row = $('#tlrow');
  const speed = $('#spd');

  const previous = document.createElement('button');
  previous.textContent = '\u25C0 Kill';
  previous.title = 'Previous kill ([)';
  previous.onclick = jumpToPreviousKill;

  const next = document.createElement('button');
  next.textContent = 'Kill \u25B6';
  next.title = 'Next kill (])';
  next.onclick = jumpToNextKill;

  row.insertBefore(previous, speed);
  row.insertBefore(next, speed);

  $('#killfeed').addEventListener('click', (e) => {
    const entry = e.target.closest('.kf');
    if (entry && state.data) jumpToTick(Number(entry.dataset.jump));
  });
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
    const jump = e.target.dataset && e.target.dataset.jump;
    if (jump !== undefined) {
      jumpToTick(Number(jump));
      return;
    }
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
    if (e.key === ']') jumpToNextKill();
    if (e.key === '[') jumpToPreviousKill();
  });
}

setupUploadUi();
setupControls();
setupKillNavigation();
setupMapZoom();
setupScoreboard();
setupEconomy(selectRound);
