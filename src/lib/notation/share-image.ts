/**
 * Capture the rendered staff as a shareable PNG.
 *
 * Pipeline:
 *  1. Read the live VexFlow SVG out of the DOM (it already uses the
 *     document's loaded Bravura/Academico fonts).
 *  2. Wrap it in an outer SVG with a white background and breathing room
 *     so the image looks good in social previews.
 *  3. Hand the SVG string to **canvg**. canvg parses the SVG in JS and
 *     paints into a regular Canvas2D context, which means it uses the
 *     document fonts via `ctx.fillText` — the same fonts the on-screen
 *     staff already renders with. No SVG-as-image trickery (which Safari
 *     refuses to load fonts into) and no VexFlow CANVAS backend (which
 *     produced primitive output).
 *  4. `canvas.toBlob('image/png')` for the final blob.
 */

import { Canvg } from 'canvg';
import type { RhythmEvent } from '../rhythm/types';

const TARGET_WIDTH = 1200;
const HORIZONTAL_PADDING = 60;
const VERTICAL_PADDING = 80;
const MIN_OUTPUT_HEIGHT = 600;

export class StaffNotRenderedError extends Error {
	constructor() {
		super('staff not rendered yet');
		this.name = 'StaffNotRenderedError';
	}
}

export interface StaffImage {
	png: Blob;
	width: number;
	height: number;
}

/**
 * The capture takes no inputs — it always reads whatever is on screen.
 * `events` and `bars` are accepted so callers (refresh effects) can declare
 * their dependency on the rhythm changing, but they don't influence the
 * output: the live SVG is the source of truth, complete with beams, ties,
 * highlights, and any other adornments the renderer added.
 */
export interface CaptureInput {
	events: RhythmEvent[];
	bars: number;
}

export async function captureStaffImage(_input: CaptureInput): Promise<StaffImage> {
	if (typeof document === 'undefined') throw new StaffNotRenderedError();

	const svgEl = document.querySelector<SVGSVGElement>('.staff-card svg');
	if (!svgEl) throw new StaffNotRenderedError();

	// Make sure document.fonts (Bravura, Academico) are ready before we
	// start drawing — canvg uses the document fonts via ctx.fillText.
	if (document.fonts?.ready) {
		try {
			await document.fonts.ready;
		} catch {
			/* ignore; will fall back to default font for any missing glyphs */
		}
	}

	const naturalWidth = svgEl.viewBox.baseVal?.width || svgEl.clientWidth || 800;
	const naturalHeight = svgEl.viewBox.baseVal?.height || svgEl.clientHeight || 180;

	const innerWidth = TARGET_WIDTH - HORIZONTAL_PADDING * 2;
	const scale = innerWidth / naturalWidth;
	const drawnHeight = naturalHeight * scale;
	const outerHeight = Math.max(MIN_OUTPUT_HEIGHT, drawnHeight + VERTICAL_PADDING * 2);
	const offsetY = (outerHeight - drawnHeight) / 2;

	// Build a self-contained SVG document: white background, the live staff
	// shifted into the padded area, scaled to fit.
	const innerXml = new XMLSerializer().serializeToString(svgEl);
	const wrappedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${outerHeight}" viewBox="0 0 ${TARGET_WIDTH} ${outerHeight}">
	<rect width="100%" height="100%" fill="#ffffff"/>
	<g transform="translate(${HORIZONTAL_PADDING} ${offsetY}) scale(${scale})">
		${stripOuterSvg(innerXml)}
	</g>
</svg>`;

	const canvas = document.createElement('canvas');
	canvas.width = TARGET_WIDTH;
	canvas.height = outerHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas not supported');

	mountDebugSvg(wrappedSvg);

	const v = await Canvg.from(ctx, wrappedSvg);
	await v.render();

	mountDebugCanvas(canvas);

	const png = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
			'image/png'
		);
	});
	console.log(
		`[share] captured staff PNG: ${canvas.width}x${canvas.height}, ${png.size} bytes`
	);
	return { png, width: canvas.width, height: canvas.height };
}

const DEBUG_HOST_ID = 'share-image-debug';

/**
 * Stuff the captured SVG and rasterised canvas into a hidden container at
 * the bottom of the document. By default it's invisible (`display: none`);
 * to inspect it from devtools, run:
 *   document.getElementById('share-image-debug').style.display = 'block'
 * (or set `window.showShareDebug = true` before refresh — applied in
 * onMount of +page.svelte).
 */
function mountDebugSvg(svgXml: string): void {
	const host = ensureDebugHost();
	host.querySelector('[data-role="svg"]')!.innerHTML = svgXml;
}

function mountDebugCanvas(canvas: HTMLCanvasElement): void {
	const host = ensureDebugHost();
	const slot = host.querySelector('[data-role="canvas"]') as HTMLDivElement;
	slot.innerHTML = '';
	const clone = canvas.cloneNode(false) as HTMLCanvasElement;
	clone.width = canvas.width;
	clone.height = canvas.height;
	clone.getContext('2d')!.drawImage(canvas, 0, 0);
	slot.appendChild(clone);
}

function ensureDebugHost(): HTMLElement {
	let host = document.getElementById(DEBUG_HOST_ID);
	if (host) return host;
	host = document.createElement('div');
	host.id = DEBUG_HOST_ID;
	host.style.cssText = 'display: none; padding: 1rem; background: #fff; color: #000; max-width: 100%; overflow: auto; border-top: 1px dashed #888;';
	host.innerHTML = `
		<h3 style="margin:0 0 .5rem;font:600 14px system-ui;">Share image debug</h3>
		<p style="margin:.25rem 0;font:12px system-ui;color:#444;">SVG that gets handed to canvg:</p>
		<div data-role="svg" style="max-width:100%;border:1px solid #ddd;background:#fff;"></div>
		<p style="margin:.75rem 0 .25rem;font:12px system-ui;color:#444;">Rasterised canvas (what becomes the share PNG):</p>
		<div data-role="canvas" style="max-width:100%;border:1px solid #ddd;background:#fff;"></div>
	`;
	const styleEl = document.createElement('style');
	styleEl.textContent = `#${DEBUG_HOST_ID} svg, #${DEBUG_HOST_ID} canvas { max-width: 100%; height: auto; display: block; }`;
	host.appendChild(styleEl);
	document.body.appendChild(host);
	return host;
}

function stripOuterSvg(svgXml: string): string {
	return svgXml.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/**
 * Best-effort: write the current staff into the og:image / twitter:image
 * meta tags so JS-aware previews pick it up. Static-site scrapers that
 * don't execute JS only see the initial HTML, so this is supplementary —
 * the canonical preview source is the file attached to navigator.share.
 */
export async function updateOgImage(input: CaptureInput): Promise<void> {
	try {
		const { png } = await captureStaffImage(input);
		const dataUrl = await blobToDataUrl(png);
		upsertMeta('property', 'og:image', dataUrl);
		upsertMeta('name', 'twitter:image', dataUrl);
		upsertMeta('name', 'twitter:card', 'summary_large_image');
	} catch (err) {
		if (err instanceof StaffNotRenderedError) return;
		console.warn('updateOgImage failed', err);
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
		reader.readAsDataURL(blob);
	});
}

function upsertMeta(attr: 'name' | 'property', value: string, content: string): void {
	let el = document.head.querySelector(`meta[${attr}="${value}"]`);
	if (!el) {
		el = document.createElement('meta');
		el.setAttribute(attr, value);
		document.head.appendChild(el);
	}
	el.setAttribute('content', content);
}
