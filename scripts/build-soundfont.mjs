import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SoundBankLoader } from 'spessasynth_core';

const SOURCE_URL = 'https://spessasus.github.io/SpessaSynth/soundfonts/GeneralUserGS.sf3';
const CACHE_PATH = fileURLToPath(new URL('../.cache/GeneralUserGS.sf3', import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL('../static/rhythm.sf3', import.meta.url));

const KEEP = [
	// Standard drum kit = bank 128 (GS drums), program 0 ("Standard 1"). This
	// one kit holds the kick, claves and woodblock we use.
	(p) => p.isGMGSDrum && p.program === 0,
	// Fretless bass is GM program 35 on bank 0.
	(p) => !p.isGMGSDrum && p.program === 35 && p.bankMSB === 0
];

/** Download the source SoundFont to an on-disk cache if we don't have it yet. */
async function fetchSource() {
	if (existsSync(CACHE_PATH)) return readFileSync(CACHE_PATH);
	console.log(`Downloading ${SOURCE_URL} …`);
	const res = await fetch(SOURCE_URL);
	if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	mkdirSync(dirname(CACHE_PATH), { recursive: true });
	writeFileSync(CACHE_PATH, buf);
	return buf;
}

function fingerprint(buf) {
	return createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

const srcBuf = await fetchSource();
console.log(`Source: ${srcBuf.length.toLocaleString()} bytes (${fingerprint(srcBuf)})`);

const bank = SoundBankLoader.fromArrayBuffer(srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength));

const before = { presets: bank.presets.length, samples: bank.samples.length };
const keep = bank.presets.filter((p) => KEEP.some((fn) => fn(p)));
const drop = bank.presets.filter((p) => !keep.includes(p));
console.log(
	`Keeping ${keep.length} preset(s): ${keep.map((p) => `${p.name}(b${p.bankMSB}p${p.program})`).join(', ')}`
);
for (const p of drop) bank.deletePreset(p);
bank.removeUnusedElements();
bank.flush();
const after = { presets: bank.presets.length, samples: bank.samples.length };
console.log(`Presets: ${before.presets} → ${after.presets}; samples: ${before.samples} → ${after.samples}`);

// Source already has Ogg-compressed samples (SF3). Pass compress:false and
// decompress:false to keep those sample blobs as-is — the ~3× size win from
// Ogg is retained without us needing an encoder on the build host.
const outBuf = await bank.writeSF2({
	compress: false,
	decompress: false,
	writeDefaultModulators: true,
	writeExtendedLimits: true
});
const outBytes = new Uint8Array(outBuf);
writeFileSync(OUTPUT_PATH, outBytes);
console.log(
	`Wrote ${OUTPUT_PATH} (${outBytes.byteLength.toLocaleString()} bytes, ${fingerprint(Buffer.from(outBytes))})`
);
