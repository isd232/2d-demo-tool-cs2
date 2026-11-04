import { $ } from './state.js';

let elements = null;

function ensureElements() {
  if (elements) return elements;
  const root = document.createElement('div');
  root.id = 'progress';
  root.innerHTML =
    '<div class="progress-track"><div class="progress-fill"></div></div>' +
    '<div class="progress-label"></div>';
  $('#drop').appendChild(root);
  elements = {
    root,
    fill: root.querySelector('.progress-fill'),
    label: root.querySelector('.progress-label'),
  };
  return elements;
}

export function showProgress(percent, label) {
  const { root, fill, label: text } = ensureElements();
  root.style.display = 'block';
  fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
  text.textContent = `${label} - ${Math.round(percent)}%`;
}

export function hideProgress() {
  if (elements) elements.root.style.display = 'none';
}
