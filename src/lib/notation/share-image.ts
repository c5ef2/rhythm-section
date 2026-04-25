/**
 * Capture the current rhythm as a shareable PNG.
 *
 * We re-render the same VexFlow staff through its **canvas** backend onto a
 * fresh detached canvas and then call `canvas.toBlob('image/png')`. The
 * canvas backend uses `ctx.fillText(...)` with the document fonts (Bravura
 * + Academico are loaded into `document.fonts` by vexflow on import), so
 * note glyphs render correctly without any SVG-image-font dance — that
 * pipeline never honoured the loaded webfonts and produced tofu boxes.
 */

import { renderRhythmToCanvas } from './render';
import type { RhythmEvent } from '../rhythm/types';

const TARGET_WIDTH = 1200; // social-friendly preview size
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

export interface CaptureInput {
	events: RhythmEvent[];
	bars: number;
}

/**
 * Render the rhythm to an offscreen canvas at preview-friendly dimensions
 * and return a PNG blob.
 */
export async function captureStaffImage({ events, bars }: CaptureInput): Promise<StaffImage> {
	if (typeof document === 'undefined') throw new StaffNotRenderedError();
	if (events.length === 0) throw new StaffNotRenderedError();

	// Render the staff to a private canvas, then composite it into the
	// final preview-sized canvas with white background and breathing room.
	const innerWidth = TARGET_WIDTH - HORIZONTAL_PADDING * 2;
	const inner = renderRhythmToCanvas(events, bars, innerWidth);
	const scale = Math.min(1, innerWidth / inner.width);
	const drawnHeight = inner.height * scale;
	const outerHeight = Math.max(MIN_OUTPUT_HEIGHT, drawnHeight + VERTICAL_PADDING * 2);

	const out = document.createElement('canvas');
	out.width = TARGET_WIDTH;
	out.height = outerHeight;
	const ctx = out.getContext('2d');
	if (!ctx) throw new Error('canvas not supported');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, out.width, out.height);
	ctx.drawImage(
		inner.canvas,
		HORIZONTAL_PADDING,
		(outerHeight - drawnHeight) / 2,
		inner.width * scale,
		drawnHeight
	);

	const png = await new Promise<Blob>((resolve, reject) => {
		out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
	});
	return { png, width: out.width, height: out.height };
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
