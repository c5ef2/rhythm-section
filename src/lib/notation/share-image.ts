/**
 * Capture the currently rendered staff as an SVG string and a PNG blob so we
 * can attach it to a native share, download, or og:image.
 *
 * The PNG is intentionally upscaled and padded to a social-friendly aspect
 * ratio so the file looks good when message apps render the preview.
 */

const TARGET_WIDTH = 1200; // social-friendly preview size
const HORIZONTAL_PADDING = 40;
const VERTICAL_PADDING = 80;
const MIN_OUTPUT_HEIGHT = 600;

export interface StaffImage {
	svg: string;
	png: Blob;
	width: number;
	height: number;
}

export async function captureStaffImage(): Promise<StaffImage> {
	const svgEl = document.querySelector<SVGSVGElement>('.staff-card svg');
	if (!svgEl) throw new Error('no staff rendered');

	const naturalWidth = svgEl.clientWidth || svgEl.viewBox.baseVal?.width || 800;
	const naturalHeight = svgEl.clientHeight || svgEl.viewBox.baseVal?.height || 180;

	// Wrap the staff in an outer SVG with explicit white background, generous
	// padding, and a fixed 1200-px-wide canvas — that's the size most chat /
	// social apps want for a rich preview, and the staff scales to fit.
	const innerWidth = TARGET_WIDTH - HORIZONTAL_PADDING * 2;
	const scale = innerWidth / naturalWidth;
	const innerHeight = naturalHeight * scale;
	const outerHeight = Math.max(MIN_OUTPUT_HEIGHT, innerHeight + VERTICAL_PADDING * 2);
	const offsetY = (outerHeight - innerHeight) / 2;

	const cloned = svgEl.cloneNode(true) as SVGSVGElement;
	cloned.removeAttribute('width');
	cloned.removeAttribute('height');
	cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	cloned.setAttribute('width', String(innerWidth));
	cloned.setAttribute('height', String(innerHeight));
	cloned.setAttribute('preserveAspectRatio', 'xMidYMid meet');

	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${outerHeight}" viewBox="0 0 ${TARGET_WIDTH} ${outerHeight}">
	<rect width="100%" height="100%" fill="#ffffff"/>
	<g transform="translate(${HORIZONTAL_PADDING} ${offsetY})">${serializeInner(cloned)}</g>
</svg>`;

	const png = await svgToPng(svg, TARGET_WIDTH, outerHeight);
	return { svg, png, width: TARGET_WIDTH, height: outerHeight };
}

function serializeInner(svgEl: SVGSVGElement): string {
	// Strip the outer <svg> tag — we're embedding its contents inside a
	// freshly composed wrapper.
	const xml = new XMLSerializer().serializeToString(svgEl);
	return xml.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
	// Blob URL beats data URL for SVG → Image rendering on Safari (avoids
	// canvas-tainted issues some iOS versions exhibit with large data URLs).
	const blob = new Blob([svg], { type: 'image/svg+xml' });
	const url = URL.createObjectURL(blob);
	try {
		const img = await loadImage(url);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas not supported');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('svg rasterisation failed'));
		img.src = src;
	});
}

/**
 * Best-effort: write the current staff into the og:image / twitter:image
 * meta tags so JS-aware previews pick it up. Static-site scrapers that
 * don't execute JS only see the initial HTML, so this is supplementary —
 * the canonical preview source is the file attached to navigator.share.
 */
export async function updateOgImage(): Promise<void> {
	try {
		const { png } = await captureStaffImage();
		const dataUrl = await blobToDataUrl(png);
		upsertMeta('property', 'og:image', dataUrl);
		upsertMeta('name', 'twitter:image', dataUrl);
		upsertMeta('name', 'twitter:card', 'summary_large_image');
	} catch (err) {
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
