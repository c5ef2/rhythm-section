/**
 * Capture the currently rendered staff as an SVG string and a PNG blob so we
 * can attach it to a native share / download / og:image.
 *
 * This reads the live VexFlow SVG from the DOM instead of re-rendering off-
 * screen; the user is always looking at a rendered staff when they hit Share,
 * so it's cheap and avoids a second VexFlow layout.
 */

const FALLBACK_WIDTH = 800;
const FALLBACK_HEIGHT = 180;
const PNG_DPR = 2;

export interface StaffImage {
	svg: string;
	png: Blob;
	width: number;
	height: number;
}

export async function captureStaffImage(): Promise<StaffImage> {
	const svgEl = document.querySelector<SVGSVGElement>('.staff-card svg');
	if (!svgEl) throw new Error('no staff rendered');

	const width = svgEl.clientWidth || FALLBACK_WIDTH;
	const height = svgEl.clientHeight || FALLBACK_HEIGHT;
	const cloned = svgEl.cloneNode(true) as SVGSVGElement;
	cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	cloned.setAttribute('width', String(width));
	cloned.setAttribute('height', String(height));

	// Force a white background so the image reads on any social preview card.
	const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	rect.setAttribute('width', '100%');
	rect.setAttribute('height', '100%');
	rect.setAttribute('fill', '#ffffff');
	cloned.insertBefore(rect, cloned.firstChild);

	const xml = new XMLSerializer().serializeToString(cloned);
	const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
	const png = await svgToPng(svg, width, height);
	return { svg, png, width, height };
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
	const svgUrl = 'data:image/svg+xml;base64,' + base64Utf8(svg);
	const img = new Image();
	img.decoding = 'sync';
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('svg rasterisation failed'));
		img.src = svgUrl;
	});
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * PNG_DPR);
	canvas.height = Math.round(height * PNG_DPR);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas not supported');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
	});
}

function base64Utf8(s: string): string {
	// btoa only takes latin-1; round-trip through UTF-8 for safety.
	return btoa(
		Array.from(new TextEncoder().encode(s))
			.map((b) => String.fromCharCode(b))
			.join('')
	);
}

/**
 * Best-effort: write the current staff into a data-URL and set it as the
 * og:image meta tag so JS-aware scrapers / in-app previews can pick it up.
 * Static-site scrapers that don't execute JS won't see it, by design.
 */
export async function updateOgImage(): Promise<void> {
	try {
		const { svg } = await captureStaffImage();
		const dataUrl = 'data:image/svg+xml;base64,' + base64Utf8(svg);
		upsertMeta('property', 'og:image', dataUrl);
		upsertMeta('name', 'twitter:image', dataUrl);
		upsertMeta('name', 'twitter:card', 'summary_large_image');
	} catch {
		// Silent — share still works without it.
	}
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
