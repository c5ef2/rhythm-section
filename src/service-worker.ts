/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `rhythm-section-${version}`;
// Everything SvelteKit says is part of this build, plus anything we've put
// under static/ (favicon, manifest, icons, the bundled SoundFont, etc.).
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
		})()
	);
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name !== CACHE) await caches.delete(name);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// Navigation requests — serve the SPA shell from cache when offline so
	// the app launches with no network.
	if (request.mode === 'navigate') {
		event.respondWith(networkFirstWithShellFallback(request));
		return;
	}

	// Everything else: cache-first for precached assets, network-then-cache
	// for the rest.
	event.respondWith(cacheFirstFallingBackToNetwork(request));
});

async function networkFirstWithShellFallback(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const fresh = await fetch(request);
		if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
		return fresh;
	} catch {
		const shell = await cache.match('./') ?? (await cache.match('index.html'));
		if (shell) return shell;
		const anyShell = await cache.match(request);
		if (anyShell) return anyShell;
		return new Response('Offline', { status: 503 });
	}
}

async function cacheFirstFallingBackToNetwork(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	try {
		const fresh = await fetch(request);
		if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
		return fresh;
	} catch {
		if (cached) return cached;
		return new Response('Offline', { status: 503 });
	}
}
