/**
 * Client-side hook that reloads the page once a freshly-deployed service
 * worker has taken control.
 *
 * Our service worker uses skipWaiting + clients.claim, so the moment a new
 * version installs it becomes the active controller and fires the browser's
 * 'controllerchange' event. On any subsequent page load the browser also
 * checks for an updated service-worker.js and installs it if different.
 * Between those two mechanisms: the user returns to the app while online,
 * the SW updates in the background, and we reload the page so the new HTML
 * + JS + assets actually paint.
 *
 * First-load safety: `controllerchange` also fires the very first time a
 * brand-new SW takes over a page that was served without one. We only
 * attach the listener if a controller was already present, which means this
 * page _was_ served by a SW and any subsequent controllerchange is an
 * update.
 */
export function reloadOnNewServiceWorker(): void {
	if (typeof navigator === 'undefined') return;
	if (!('serviceWorker' in navigator)) return;
	if (!navigator.serviceWorker.controller) return;

	let reloading = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (reloading) return;
		reloading = true;
		location.reload();
	});
}
