import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../src/lib/assets/favicon.svg', import.meta.url), 'utf8');

function rasterise(size, output, background) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: size },
		background
	});
	writeFileSync(output, resvg.render().asPng());
}

// Regular square icons — transparent background so the rounded-rect from the
// SVG shows through.
rasterise(192, new URL('../static/icon-192.png', import.meta.url));
rasterise(512, new URL('../static/icon-512.png', import.meta.url));

// Maskable icon — solid brand-blue background, the SVG keeps its rounded
// rect but launchers can crop a circle/squircle out of it without eating the
// glyph.
rasterise(
	512,
	new URL('../static/icon-maskable.png', import.meta.url),
	'#6f8cff'
);

// iOS apple-touch-icon. Safari rounds the corners itself, so ship a solid
// square that matches the brand background.
rasterise(
	180,
	new URL('../static/apple-touch-icon.png', import.meta.url),
	'#6f8cff'
);

console.log('icons written');
