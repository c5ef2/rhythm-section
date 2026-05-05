#!/usr/bin/env node
/**
 * One-time render script. Drives spessasynth_core in offline mode to bake
 * the six rhythm voices we play (kick, snare, closed hihat, woodblock,
 * claves, bass) from a SoundFont 2 file into individual mono WAV files in
 * `static/samples/`. The runtime synth (`src/lib/audio/web-audio-synth.ts`)
 * fetches and decodes those WAVs at startup and plays them via
 * `AudioBufferSourceNode` — no SoundFont, no worklet, no spessasynth at
 * runtime.
 *
 * spessasynth_core is NOT a project dependency; it's only needed when you
 * re-render the samples. To do so:
 *
 *   1. Place a Standard-1-drum-kit + Fretless-Bass SF2 at
 *      `scripts/.tmp-rhythm.sf3` (the trimmed file used by the old build
 *      is recoverable from git history at the commit that deleted it).
 *   2. `npm install --no-save spessasynth_core`
 *   3. `node scripts/render-samples.mjs`
 *   4. The dev dependency leaves the lockfile alone because of `--no-save`,
 *      so nothing else needs cleaning up.
 *
 * Outputs:
 *   - static/samples/{kick,snare,hihat,woodblock,claves,bass}.wav
 *
 * Total bundle for the six samples is ~250 KB at 44.1 kHz mono — well
 * below the old 770 KB SF2 + 140 KB worklet + ~1 MB spessasynth_lib.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SoundBankLoader, SpessaSynthProcessor, audioToWav } from 'spessasynth_core';

const SF2_PATH = fileURLToPath(new URL('./.tmp-rhythm.sf3', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../static/samples/', import.meta.url));

const SAMPLE_RATE = 44100;
const BLOCK = 128;
const DRUM_CHANNEL = 9;
const MELODIC_CHANNEL = 0;
const FRETLESS_BASS_PROGRAM = 35;

// Tail-trim threshold: once the absolute amplitude stays below this for
// `SILENCE_TAIL_BLOCKS` consecutive blocks, we cut the sample. -60 dB is
// inaudible against any reasonable playback volume.
const SILENCE_THRESHOLD = 0.001;
const SILENCE_TAIL_BLOCKS = 8;

const VOICES = [
	{ name: 'kick', channel: DRUM_CHANNEL, note: 36, velocity: 115, maxSec: 0.6 },
	{ name: 'snare', channel: DRUM_CHANNEL, note: 38, velocity: 105, maxSec: 0.6 },
	{ name: 'hihat', channel: DRUM_CHANNEL, note: 42, velocity: 75, maxSec: 0.4 },
	{ name: 'woodblock', channel: DRUM_CHANNEL, note: 76, velocity: 95, maxSec: 0.3 },
	{ name: 'claves', channel: DRUM_CHANNEL, note: 75, velocity: 120, maxSec: 0.3 },
	// Bass: render the attack + a chunk of sustain. Runtime envelope on a
	// GainNode handles per-note duration. 1.5 s gives the runtime room to
	// fade out cleanly even on the longest practical bass note (1 bar at
	// 40 BPM = 6 s, but that's loop length, not a single note — and we
	// loop the buffer if needed).
	{ name: 'bass', channel: MELODIC_CHANNEL, note: 33, velocity: 100, maxSec: 1.5 }
];

async function main() {
	const sf2Buffer = await readFile(SF2_PATH);
	const bank = SoundBankLoader.fromArrayBuffer(sf2Buffer.buffer);

	await mkdir(OUT_DIR, { recursive: true });

	for (const voice of VOICES) {
		// Fresh processor per voice — keeps the renderer's internal state
		// from carrying decay tails between voices, and lets us reset the
		// melodic channel program for the bass without polluting the
		// drums.
		const processor = new SpessaSynthProcessor(SAMPLE_RATE);
		await processor.processorInitialized;
		processor.soundBankManager.addSoundBank(bank, 'main');
		if (voice.channel === MELODIC_CHANNEL) {
			processor.programChange(MELODIC_CHANNEL, FRETLESS_BASS_PROGRAM);
		}

		const totalSamples = Math.ceil(voice.maxSec * SAMPLE_RATE);
		const blocks = Math.ceil(totalSamples / BLOCK);
		const left = new Float32Array(totalSamples);
		const right = new Float32Array(totalSamples);
		const blockL = new Float32Array(BLOCK);
		const blockR = new Float32Array(BLOCK);

		processor.noteOn(voice.channel, voice.note, voice.velocity);

		let writeIdx = 0;
		let quietBlocks = 0;
		let lastNonSilent = 0;
		for (let b = 0; b < blocks; b++) {
			blockL.fill(0);
			blockR.fill(0);
			processor.process(blockL, blockR);
			const room = totalSamples - writeIdx;
			const n = Math.min(BLOCK, room);
			left.set(blockL.subarray(0, n), writeIdx);
			right.set(blockR.subarray(0, n), writeIdx);
			writeIdx += n;

			let peak = 0;
			for (let i = 0; i < n; i++) {
				const a = Math.abs(blockL[i]) + Math.abs(blockR[i]);
				if (a > peak) peak = a;
			}
			if (peak > SILENCE_THRESHOLD) {
				lastNonSilent = writeIdx;
				quietBlocks = 0;
			} else if (b > 4) {
				// Don't trim before the attack has had a chance to start.
				quietBlocks++;
				if (quietBlocks >= SILENCE_TAIL_BLOCKS) break;
			}
		}

		const trimmed = Math.max(lastNonSilent, BLOCK);
		// Sum to mono. The drum kit's stereo image is mostly placement
		// and barely audible on phone speakers; halving file size matters
		// more than width.
		const mono = new Float32Array(trimmed);
		for (let i = 0; i < trimmed; i++) {
			mono[i] = (left[i] + right[i]) * 0.5;
		}

		const wav = audioToWav([mono], SAMPLE_RATE, { normalizeAudio: true });
		const outPath = `${OUT_DIR}${voice.name}.wav`;
		await writeFile(outPath, Buffer.from(wav));
		const seconds = (trimmed / SAMPLE_RATE).toFixed(3);
		const kib = (wav.byteLength / 1024).toFixed(1);
		console.log(`${voice.name.padEnd(10)} ${seconds}s  ${kib} KiB  →  ${outPath}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
