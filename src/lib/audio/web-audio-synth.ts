import { base } from '$app/paths';
import type { Synth } from './scheduler';

/**
 * Sample-based synth. Six pre-rendered drum / bass voices are fetched and
 * decoded once at startup; every hit then becomes a fresh
 * `AudioBufferSourceNode` pointing at the right buffer, gated by a
 * `GainNode`.
 *
 * Why not spessasynth: every `noteOn(time)` it accepted was queued inside
 * an opaque worklet that we couldn't cancel. With AudioBufferSourceNode and
 * OscillatorNode we hold the references ourselves, and `stopAll()`
 * actually aborts every event we've scheduled into the future.
 *
 * Why not synthesized voices: oscillator-only kicks / snares / hats sound
 * thin compared to even a plain GM SoundFont. The samples below were
 * baked once from the bundled SF2 (`scripts/render-samples.mjs`) so we
 * keep that quality without shipping the SF2 + spessasynth at runtime.
 */

type Voice = 'kick' | 'snare' | 'hihat' | 'woodblock' | 'claves' | 'bass';

const VOICE_FILES: Record<Voice, string> = {
	kick: 'samples/kick.wav',
	snare: 'samples/snare.wav',
	hihat: 'samples/hihat.wav',
	woodblock: 'samples/woodblock.wav',
	claves: 'samples/claves.wav',
	bass: 'samples/bass.wav'
};

/**
 * Per-voice gain trim. `audioToWav({ normalizeAudio: true })` peak-
 * normalises every sample to 0 dBFS, so without trims the kit would be
 * uniformly loud — these match the original spessasynth velocities the
 * old synth used (115/105/75 etc.) so the mix balance stays close to
 * what we had.
 */
const VOICE_GAIN: Record<Voice, number> = {
	kick: 0.9,
	snare: 0.85,
	hihat: 0.5,
	woodblock: 0.55,
	claves: 0.7,
	bass: 0.65
};

export async function loadVoiceBuffers(ctx: AudioContext): Promise<Record<Voice, AudioBuffer>> {
	const entries = await Promise.all(
		(Object.keys(VOICE_FILES) as Voice[]).map(async (name) => {
			const url = `${base}/${VOICE_FILES[name]}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
			const data = await res.arrayBuffer();
			const buffer = await ctx.decodeAudioData(data);
			return [name, buffer] as const;
		})
	);
	return Object.fromEntries(entries) as Record<Voice, AudioBuffer>;
}

/**
 * BT vs. wired/built-in detection threshold (seconds of output latency).
 * Built-in speakers and wired headphones typically report 0.005–0.02 s;
 * Bluetooth headsets land in the 0.10–0.30 s range. 0.05 s sits well
 * between the two clusters with room for outliers either way.
 */
export const BT_LATENCY_THRESHOLD_SEC = 0.05;

/**
 * True when the AudioContext's output looks like a Bluetooth sink — sole
 * signal is its reported `outputLatency`. Returning `false` for unknown /
 * zero latency means we won't run the keep-alive noise on outputs we can't
 * measure; the cost is a single clipped click on the first BT hit before
 * the user can re-pair, which is much less annoying than steady noise on
 * outputs that don't need it.
 */
export function isBluetoothLikely(outputLatencySec: number | undefined | null): boolean {
	if (typeof outputLatencySec !== 'number') return false;
	if (!Number.isFinite(outputLatencySec) || outputLatencySec <= 0) return false;
	return outputLatencySec >= BT_LATENCY_THRESHOLD_SEC;
}

export class WebAudioSynth implements Synth {
	private active = new Set<AudioBufferSourceNode>();
	private keepAlive: AudioScheduledSourceNode | null = null;

	constructor(
		private readonly ctx: AudioContext,
		private readonly buffers: Record<Voice, AudioBuffer>
	) {
		this.refreshKeepAlive();
	}

	/**
	 * Re-check the output device and toggle the BT keep-alive accordingly.
	 * Called once at construction; the Player also calls it on every
	 * `run()` so a device change (e.g., user pairs BT mid-session) starts
	 * the keep-alive on the next Play press without forcing a reload.
	 */
	refreshKeepAlive(): void {
		const shouldRun = isBluetoothLikely(this.ctx.outputLatency);
		if (shouldRun && !this.keepAlive) this.startKeepAlive();
		else if (!shouldRun && this.keepAlive) this.stopKeepAlive();
	}

	/**
	 * Bluetooth audio devices power-save their codec between packets:
	 * when the audio stream falls below the codec's silence threshold
	 * for more than a few tens of milliseconds the receiver buffers /
	 * sleeps, and the next event gets clipped or dropped during wake-up.
	 * We never let the stream go silent.
	 *
	 * The signal has to satisfy three constraints:
	 *
	 * 1. **Pass the codec's DC blocker.** SBC / AAC / aptX run a high-
	 *    pass filter (~10–20 Hz cut-off) on the line-in, so a pure DC
	 *    offset gets stripped to zero before the codec ever sees it.
	 * 2. **Stay above the codec's silence threshold.** Empirically that
	 *    sits around -55 to -65 dB; below that, longer rests and
	 *    bar-line gaps still let the codec sleep.
	 * 3. **Stay perceptually below the noise floor** on the typical
	 *    playback chain: phone speakers, earbuds, and over-ear
	 *    headphones — including the ones with adaptive DSP / AGC.
	 *
	 * The third constraint is the hard one. A previous version used a
	 * 30 Hz sine, which works for codecs but gives BT headphones'
	 * dynamic-EQ / AGC a perfect target to lock onto and *boost* — the
	 * "keep-alive" became audible as a low buzz and got worse, not
	 * better, as we lowered the gain (the AGC compensated more).
	 *
	 * White noise is the workaround. Codecs see broadband activity and
	 * never sleep; AGC can't single out a frequency to amplify; and
	 * even when slightly audible it perceptually blends into room
	 * noise instead of standing out as a tone. Loop a 1-second buffer
	 * of band-limited noise at ≈-78 dB through a `GainNode` for the
	 * AudioContext's lifetime. The codec wake/sleep gate is a broadband
	 * activity detector, not a dB threshold, so we can sit well below
	 * the -55/-65 dB silence floor without putting the codec back to
	 * sleep — which is what lets us drop the level this far below
	 * audible without losing the keep-alive effect.
	 */
	private startKeepAlive(): void {
		const KEEPALIVE_GAIN = 0.000125; // ≈ -78 dB
		const buffer = createKeepAliveNoiseBuffer(this.ctx);
		const src = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
		const gain = new GainNode(this.ctx, { gain: KEEPALIVE_GAIN });
		src.connect(gain).connect(this.ctx.destination);
		src.start();
		this.keepAlive = src;
	}

	private stopKeepAlive(): void {
		try {
			this.keepAlive?.stop();
		} catch {
			// already stopped — fine
		}
		this.keepAlive = null;
	}

	playClick(time: number, emphasis: 'downbeat' | 'onbeat' | 'subbeat'): void {
		// Downbeat = claves (sharper, brighter). On / sub-beats = woodblock,
		// with sub-beats quieter so they don't fight the rhythm voices.
		const voice: Voice = emphasis === 'downbeat' ? 'claves' : 'woodblock';
		const gain =
			emphasis === 'downbeat' ? 1.0 : emphasis === 'onbeat' ? 0.85 : 0.55;
		this.fire(voice, time, gain);
	}

	playKick(time: number): void {
		this.fire('kick', time, 1.0);
	}

	playSnare(time: number): void {
		this.fire('snare', time, 1.0);
	}

	playHihat(time: number): void {
		this.fire('hihat', time, 1.0);
	}

	playBass(time: number, durationSec: number): void {
		// The baked bass sample is ~1.5 s. Hold it via the buffer's natural
		// playback up to durationSec, then ramp the gain down over a small
		// release window so the cutoff isn't a click. For notes longer than
		// the buffer, AudioBufferSourceNode would simply end early — but at
		// 40 BPM a whole note is 6 s, which would need looping. The SF2
		// sample encodes a sustaining pluck; setting `loop = true` on a
		// segment of it would risk a comb-filter buzz. Keep it unlooped
		// for now and accept that very long bass notes will end with the
		// buffer; this matches what spessasynth did effectively (the SF2
		// sample loop point had the same release character).
		const buffer = this.buffers.bass;
		const src = new AudioBufferSourceNode(this.ctx, { buffer });
		const env = new GainNode(this.ctx, { gain: 0 });
		const peak = VOICE_GAIN.bass;
		const RELEASE = Math.min(0.08, durationSec * 0.5);
		const stopAt = time + Math.min(durationSec, buffer.duration);
		env.gain.setValueAtTime(peak, time);
		env.gain.setValueAtTime(peak, Math.max(time, stopAt - RELEASE));
		env.gain.exponentialRampToValueAtTime(0.001, stopAt);
		src.connect(env).connect(this.ctx.destination);
		this.track(src);
		src.start(time);
		src.stop(stopAt + 0.02);
	}

	stopAll(): void {
		// Calling .stop() on a source node aborts even start times that
		// haven't been reached yet, so this drains both currently-sounding
		// notes AND any future-scheduled ones the Player decided to abandon.
		for (const src of this.active) {
			try {
				src.stop();
			} catch {
				// Already stopped or not yet started — fine.
			}
		}
		this.active.clear();
	}

	destroy(): void {
		this.stopAll();
		this.stopKeepAlive();
	}

	private fire(voice: Voice, time: number, gainFactor: number): void {
		const buffer = this.buffers[voice];
		const src = new AudioBufferSourceNode(this.ctx, { buffer });
		const gain = new GainNode(this.ctx, { gain: VOICE_GAIN[voice] * gainFactor });
		src.connect(gain).connect(this.ctx.destination);
		this.track(src);
		src.start(time);
		src.stop(time + buffer.duration + 0.02);
	}

	private track(src: AudioBufferSourceNode): void {
		this.active.add(src);
		src.onended = () => {
			this.active.delete(src);
		};
	}
}

/**
 * Generate one second of white noise as a mono AudioBuffer. Looped on a
 * source node, this is the keep-alive signal for Bluetooth output (see
 * {@link WebAudioSynth.startKeepAlive}). One second is plenty long to
 * avoid any audible periodicity at the loop boundary.
 */
function createKeepAliveNoiseBuffer(ctx: AudioContext): AudioBuffer {
	const length = ctx.sampleRate;
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}
