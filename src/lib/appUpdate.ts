// U-1: show a new version as soon as it is installed, not on the open after next.
//
// The service worker (vite-plugin-pwa, autoUpdate) downloads a deploy in the background and takes over the page
// (skipWaiting + clientsClaim), but the page keeps running the code it started with. Without this, an installed
// app needed two opens to show an update: the first downloads it, the second shows it. A whole new page (the
// Pantry) stayed invisible that way.
//
// When the new worker takes over, reload, unless you are in the middle of something (a field focused or a sheet
// open): then reload the next time the app goes to the background, so nothing half-typed is lost.
// Kept tiny: it is in the startup bundle (scripts/check-bundle.mjs).

/** Whether reloading now could lose something the user is typing. Pure, so it can be tested. */
export function busy(active: { tagName?: string; isContentEditable?: boolean } | null | undefined, dialogOpen: boolean) {
  return dialogOpen || !!active?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName ?? '');
}

export function reloadOnUpdate() {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  // No worker yet = the first visit: the worker that installs now holds the same code, so there is nothing to reload.
  if (!sw?.controller) return;
  let done = false;
  const reload = () => { if (!done) { done = true; location.reload(); } };
  sw.addEventListener('controllerchange', () => {
    if (!busy(document.activeElement as HTMLElement | null, !!document.querySelector('[role=dialog]'))) return reload();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') reload(); });
  });
}
