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

	const svgEl = await waitForStaff();
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

	// VexFlow's outer <svg> carries presentation attrs every child inherits
	// (font-family="Bravura,Academico", font-size, fill="black", stroke="black").
	// Nesting that <svg> inside another <svg> + a <g scale(s)> made canvg
	// stretch the y-axis (inner viewBox + outer transform interaction is
	// fragile across renderers). Instead: copy the original svg's children
	// into a wrapping <g> and re-apply the inherited presentation attrs
	// directly on that group, so attribute inheritance reaches every child.
	const naturalWidth =
		Number(svgEl.getAttribute('width')) ||
		svgEl.viewBox.baseVal?.width ||
		svgEl.clientWidth ||
		800;
	const naturalHeight =
		Number(svgEl.getAttribute('height')) ||
		svgEl.viewBox.baseVal?.height ||
		svgEl.clientHeight ||
		180;

	const innerWidth = TARGET_WIDTH - HORIZONTAL_PADDING * 2;
	const scale = innerWidth / naturalWidth;
	const drawnHeight = naturalHeight * scale;
	const outerHeight = Math.max(MIN_OUTPUT_HEIGHT, drawnHeight + VERTICAL_PADDING * 2);
	const offsetY = (outerHeight - drawnHeight) / 2;

	// Serialise just the children of the live svg.
	const childXml = Array.from(svgEl.children)
		.map((c) => new XMLSerializer().serializeToString(c))
		.join('');

	const inheritedAttrs = inheritedPresentation(svgEl);

	const wrappedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${outerHeight}" viewBox="0 0 ${TARGET_WIDTH} ${outerHeight}">
	<rect width="100%" height="100%" fill="#ffffff"/>
	<g transform="translate(${HORIZONTAL_PADDING} ${offsetY}) scale(${scale})" ${inheritedAttrs}>${childXml}</g>
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

function inheritedPresentation(svgEl: SVGSVGElement): string {
	// VexFlow sets these on the outer <svg>; they propagate to every child
	// via SVG attribute inheritance. We re-attach them to the wrapping <g>
	// in the captured SVG so the children render the same once detached.
	const candidates: Array<[string, string]> = [
		['fill', svgEl.getAttribute('fill') ?? 'black'],
		['stroke', svgEl.getAttribute('stroke') ?? 'black'],
		['stroke-width', svgEl.getAttribute('stroke-width') ?? '1'],
		[
			'font-family',
			svgEl.getAttribute('font-family') ?? 'Bravura, Academico, serif'
		],
		['font-size', svgEl.getAttribute('font-size') ?? '10pt'],
		['font-weight', svgEl.getAttribute('font-weight') ?? 'normal'],
		['font-style', svgEl.getAttribute('font-style') ?? 'normal']
	];
	return candidates
		.map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
		.join(' ');
}

/**
 * Poll for the live staff SVG for a couple of seconds. The Staff component's
 * VexFlow render is gated on a ResizeObserver firing, so on first paint the
 * SVG isn't always in the DOM yet when the rhythm-change effect runs.
 */
async function waitForStaff(): Promise<SVGSVGElement | null> {
	const deadline = performance.now() + 2000;
	let svg = document.querySelector<SVGSVGElement>('.staff-card svg');
	while (!svg && performance.now() < deadline) {
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		svg = document.querySelector<SVGSVGElement>('.staff-card svg');
	}
	return svg;
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
