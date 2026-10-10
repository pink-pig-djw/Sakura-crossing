// Fullscreen for the whole page (canvas, HUD and touch controls) through the Fullscreen
// API, with the webkit-prefixed calls iPad Safari still uses. While fullscreen, Chrome and
// Edge also hand the Esc key to the page (Keyboard Lock): a tap opens the menu as usual
// instead of leaving fullscreen, and holding Esc leaves it. iPhone Safari has no element
// fullscreen at all; there the game can be added to the home screen and opened from it
// (the apple-mobile-web-app metas in index.html), which shows it without the browser bars.
const d = document;
const root = d.documentElement;

export const fullscreenSupported = !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
export const isFullscreen = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
// iPadOS reports itself as a Mac and does have fullscreen; only iPhone / iPod lack it
export const isIPhone = /iPhone|iPod/.test(navigator.userAgent);

// resolves true once the switch has been asked for, false when the browser refused it
// (no user gesture, an embedding frame without allowfullscreen, ...)
export async function setFullscreen(on) {
  if (on === isFullscreen()) return true;
  try {
    if (on) {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else return false;
      navigator.keyboard?.lock?.(['Escape']).catch(() => {});
    } else {
      navigator.keyboard?.unlock?.();
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    }
    return true;
  } catch {
    return false;
  }
}

// Chrome fires both the plain and the webkit event: listen to one of them
export function onFullscreenChange(fn) {
  const type = 'onfullscreenchange' in d ? 'fullscreenchange' : 'webkitfullscreenchange';
  d.addEventListener(type, () => {
    const on = isFullscreen();
    if (!on) navigator.keyboard?.unlock?.();
    fn(on);
  });
}
