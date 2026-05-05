import type {
	HihatSubdivision,
	MetronomeOptions,
	NoteLength,
	RhythmEvent,
	RhythmInstrument
} from '../rhythm/types';
import { configureIosPlayback, primeIosPlayback } from './ios-audio';
import { pickRestartTime } from './restart';
import { Scheduler, type Synth } from './scheduler';
import { createSoundFontSynth, fetchBundledSoundFont } from './soundfont-synth';
import { WakeLock } from './wake-lock';

export interface PlayInputs {
	events: RhythmEvent[];
	bars: number;
	bpm: number;
	metronome: MetronomeOptions;
	rhythmAudio: boolean;
	rhythmInstrument: RhythmInstrument;
	allowedLengths: NoteLength[];
	snareOnBackbeats: boolean;
	hihatSubdivision: HihatSubdivision;
	countInBars: number;
	loop: boolean;
}

export type SoundFontStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlayerCallbacks {
	onActiveNote(index: number | null): void;
	onStopped(): void;
	onSoundFontStatus?(status: SoundFontStatus): void;
}

/**
 * Owns the AudioContext, active Synth and the Scheduler. Stateless with
 * respect to user settings: every `run(inputs)` starts fresh, so callers can
 * keep their settings in one place and trigger a restart whenever anything
 * that affects playback has changed.
 *
 * Audio output is exclusively SoundFont-backed — there's no oscillator
 * fallback. The UI gates Play behind `soundFontStatus === 'ready'`, so
 * `run()` is only ever called when the synth is real.
 */
export class Player {
	private ctx: AudioContext | null = null;
	private synth: Synth | null = null;
	private soundFontPromise: Promise<Synth> | null = null;
	private scheduler: Scheduler | null = null;
	private wakeLock = new WakeLock();

	constructor(private readonly callbacks: PlayerCallbacks) {}

	/**
	 * Public entry point that callers invoke as soon as the page is ready.
	 * Creates the AudioContext (suspended is fine — we never resume it here)
	 * and kicks off the SoundFont fetch + synth init in the background. By
	 * the time the user hits Play the worklet is wired up and a single
	 * `ctx.resume()` is enough to start hearing audio.
	 */
	preload(): Promise<void> {
		try {
			this.ensureContext();
		} catch (err) {
			// Some browsers refuse to create an AudioContext outside a gesture.
			// We'll try again from inside `run()` when one is available.
			console.warn('AudioContext could not be created eagerly', err);
			return Promise.resolve();
		}
		return this.kickOffSoundFontLoad().then(
			() => undefined,
			() => undefined
		);
	}

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			configureIosPlayback(this.ctx);
		}
		return this.ctx;
	}

	/**
	 * Fetch the bundled SoundFont and initialise SpessaSynth on top of the
	 * existing AudioContext. Idempotent — repeated calls return the same
	 * promise. On fetch/init failure (e.g. brand-new device, offline first
	 * visit, no SW cache yet) we surface 'error' so the UI can keep Play
	 * disabled and tell the user to come back online.
	 */
	private kickOffSoundFontLoad(): Promise<Synth> {
		if (this.soundFontPromise) return this.soundFontPromise;
		const ctx = this.ctx;
		if (!ctx) return Promise.reject(new Error('no AudioContext'));
		this.callbacks.onSoundFontStatus?.('loading');
		this.soundFontPromise = (async () => {
			const buffer = await fetchBundledSoundFont();
			const synth = await createSoundFontSynth({ ctx, soundFontBuffer: buffer });
			this.synth = synth;
			this.callbacks.onSoundFontStatus?.('ready');
			return synth;
		})().catch((err) => {
			console.warn('Bundled SoundFont failed to load', err);
			this.soundFontPromise = null; // allow a retry next time
			this.callbacks.onSoundFontStatus?.('error');
			throw err;
		});
		return this.soundFontPromise;
	}

	async run(inputs: PlayInputs): Promise<void> {
		// Must run synchronously inside the click stack — primeIosPlayback's
		// silent-audio play() is rejected outside a user gesture, so the
		// async work below can't precede it.
		primeIosPlayback();
		const ctx = this.ensureContext();
		if (ctx.state === 'suspended') await ctx.resume();
		// If preload didn't fire (or refused without a gesture), kick the
		// load off now. Returns the loaded synth or surfaces 'error'.
		const synth = this.synth ?? (await this.kickOffSoundFontLoad());

		// Read the previous scheduler's tail BEFORE stopping it, so we know
		// how far the worklet's queued audio extends. The new cycle has to
		// start past that tail or the old rhythm's pre-queued kicks will
		// still fire on top of the new highlights (and visibly desync).
		const isRestart = this.scheduler !== null;
		const prevTail = this.scheduler?.tailTime ?? 0;
		this.scheduler?.stop();
		// Cut any sustaining note (e.g. a long bass) so its tail doesn't leak
		// under the next cycle.
		if (isRestart) synth.stopAll();
		// Bluetooth output adds 150–300 ms of latency; lead the output buffer
		// by twice that so noteOn events don't land in the past. Built-in
		// speakers report ~10 ms or 0 here so the floor stays at 0.05.
		const outputLatency = (ctx as { outputLatency?: number }).outputLatency ?? 0;
		const preroll = Math.max(0.05, outputLatency * 2);
		this.scheduler = new Scheduler({
			ctx,
			synth,
			events: inputs.events,
			bars: inputs.bars,
			bpm: inputs.bpm,
			metronome: inputs.metronome,
			rhythmAudio: inputs.rhythmAudio,
			rhythmInstrument: inputs.rhythmInstrument,
			allowedLengths: inputs.allowedLengths,
			snareOnBackbeats: inputs.snareOnBackbeats,
			hihatSubdivision: inputs.hihatSubdivision,
			countInBars: inputs.countInBars,
			loop: inputs.loop,
			startFloor: pickRestartTime(ctx.currentTime, prevTail, preroll),
			onHighlight: (i) => this.callbacks.onActiveNote(i),
			onComplete: () => {
				this.wakeLock.release();
				this.callbacks.onStopped();
			}
		});
		this.scheduler.start();
		this.wakeLock.acquire();
	}

	stop(): void {
		this.scheduler?.stop();
		this.scheduler = null;
		this.wakeLock.release();
		this.callbacks.onActiveNote(null);
	}
}
