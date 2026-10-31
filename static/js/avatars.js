import { state } from './state.js';

export function loadAvatars() {
  state.avatarImages = state.data.avatars.map((url) => {
    if (!url) return null;
    const img = new Image();
    img.src = url;
    return img;
  });
}

export function avatarOf(player) {
  const img = state.avatarImages[player];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
