import type { MetronomeOptions, NoteLength, RhythmEvent } from '../rhythm/types';
import { configureIosPlayback, primeIosPlayback } from './ios-audio';
import { Scheduler } from './scheduler';
import { createSoundFontSynth, fetchBundledSoundFont } from './soundfont-synth';
import { oscillatorSynth, type RhythmInstrument, type Synth } from './synth';
import { WakeLock } from './wake-lock';

export interface PlayInputs {
	events: RhythmEvent[];
	bars: number;
	bpm: number;
	metronome: MetronomeOptions;
	rhythmAudio: boolean;
	rhythmInstrument: RhythmInstrument;
	allowedLengths: NoteLength[];
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

	private ensureContext(): { ctx: AudioContext; synth: Synth } {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			configureIosPlayback(this.ctx);
		}
		if (!this.synth) this.synth = oscillatorSynth(this.ctx);
		return { ctx: this.ctx, synth: this.synth };
	}

	private async ensureAudio(): Promise<{ ctx: AudioContext; synth: Synth }> {
		const { ctx, synth } = this.ensureContext();
		if (ctx.state === 'suspended') await ctx.resume();
		// If preload didn't run (or failed because the context wasn't allowed
		// yet), kick the load off here. Once it resolves, `this.synth` is the
		// SoundFont-backed synth.
		void this.kickOffSoundFontLoad();
		return { ctx, synth: this.synth ?? synth };
	}

	/**
	 * Fetch the bundled SoundFont and initialise SpessaSynth on top of the
	 * existing AudioContext. Idempotent — repeated calls return the same
	 * promise. On fetch/init failure (e.g. offline before the service worker
	 * has cached it) we leave the oscillator fallback in place and let a
	 * later call try again.
	 */
	private kickOffSoundFontLoad(): Promise<Synth> {
		if (this.soundFontPromise) return this.soundFontPromise;
		const ctx = this.ctx;
		if (!ctx) return Promise.reject(new Error('no AudioContext'));
		this.callbacks.onSoundFontStatus?.('loading');
		this.soundFontPromise = (async () => {
			const buffer = await fetchBundledSoundFont();
			const synth = await createSoundFontSynth({ ctx, soundFontBuffer: buffer });
			this.synth?.destroy();
			this.synth = synth;
			this.callbacks.onSoundFontStatus?.('ready');
			return synth;
		})().catch((err) => {
			console.warn('Bundled SoundFont unavailable, staying on oscillator fallback', err);
			this.soundFontPromise = null; // allow retry on next ensureAudio
			this.callbacks.onSoundFontStatus?.('error');
			throw err;
		});
		return this.soundFontPromise;
	}

	async run(inputs: PlayInputs): Promise<void> {
		// Must run synchronously inside the click stack — primeIosPlayback's
		// silent-audio play() is rejected outside a user gesture, so the
		// async ensureAudio() can't follow it.
		primeIosPlayback();
		const { ctx, synth } = await this.ensureAudio();
		this.scheduler?.stop();
		this.scheduler = new Scheduler({
			ctx,
			click: synth,
			rhythm: synth,
			events: inputs.events,
			bars: inputs.bars,
			bpm: inputs.bpm,
			metronome: inputs.metronome,
			rhythmAudio: inputs.rhythmAudio,
			rhythmInstrument: inputs.rhythmInstrument,
			allowedLengths: inputs.allowedLengths,
			countInBars: inputs.countInBars,
			loop: inputs.loop,
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
