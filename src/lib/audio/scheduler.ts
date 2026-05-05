import { buildEventList, type AudioEvent, type BuildEventListInput } from './events';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

type HighlightListener = (rhythmEventIndex: number | null) => void;

/**
 * The combined audio sink the Player hands to the Scheduler. Currently the
 * only implementation is the SoundFont-backed synth in soundfont-synth.ts.
 *
 * Click and rhythm methods sit on the same object because in practice the
 * Player has always handed the same SoundFont synth to both — they share a
 * worklet, a soundbank, and a destination. Splitting them into separate
 * `ClickSink` / `RhythmSink` interfaces invited callers to assume the two
 * could differ, when they can't.
 */
export interface Synth {
	playClick(time: number, emphasis: 'downbeat' | 'onbeat' | 'subbeat'): void;
	playKick(time: number): void;
	playSnare(time: number): void;
	playHihat(time: number): void;
	playBass(time: number, durationSec: number): void;
	/**
	 * Silence anything currently sounding (e.g. a sustaining bass note from a
	 * cycle the Player just decided to abandon). The new cycle's startTime is
	 * already pushed past the worklet's scheduled-noteOn queue; this only
	 * handles the audible tail of notes that already fired.
	 */
	stopAll(): void;
	destroy(): void;
}

export interface SchedulerConfig extends Omit<BuildEventListInput, 'startTime'> {
	ctx: AudioContext;
	synth: Synth;
	onHighlight: HighlightListener;
	loop?: boolean;
	onComplete?: () => void;
	/**
	 * Floor for the cycle's start time. Used by the Player when restarting the
	 * scheduler (e.g. after regenerate) to make sure the new cycle begins after
	 * the look-ahead window of the previous scheduler has fully elapsed —
	 * otherwise the spessasynth worklet's pre-queued `noteOn` events for the
	 * old rhythm bleed audibly into the new highlights.
	 */
	startFloor?: number;
}

interface HighlightMark {
	time: number;
	index: number;
}

export class Scheduler {
	private ctx: AudioContext;
	private cfg: SchedulerConfig;
	private events: AudioEvent[] = [];
	private highlights: HighlightMark[] = [];
	private nextEventIdx = 0;
	private timer: number | null = null;
	private rafHandle: number | null = null;
	private lastActive: number | null = null;
	private running = false;
	/**
	 * Audio-context time at which the CURRENT cycle ends (= startTime of the
	 * next cycle when looping). Computed once per cycle so seamless loop
	 * restarts land exactly on the downbeat instead of drifting forward based
	 * on where the last scheduled event happened to be.
	 */
	private cycleEndTime = 0;
	/**
	 * Latest audio-context time we've actually committed to the synth (i.e.
	 * passed to `playClick`/`playKick`/.../`playBass`, including bass sustain).
	 * The Player reads this after stop() so the next cycle can begin past the
	 * tail of the previous one without overlapping audio.
	 */
	private dispatchedHorizon = 0;

	constructor(config: SchedulerConfig) {
		this.ctx = config.ctx;
		this.cfg = config;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		const earliest = this.ctx.currentTime + 0.05;
		const startTime = Math.max(earliest, this.cfg.startFloor ?? 0);
		this.prime(startTime, this.cfg.countInBars);
		this.tick();
		this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
		this.rafHandle = requestAnimationFrame(() => this.highlightFrame());
	}

	/**
	 * Time of the last audio event we sent to the synth (kick/snare/hihat/bass
	 * including its sustain, plus metronome clicks). `0` when the scheduler
	 * never dispatched anything. The Player uses this to start the next cycle
	 * past the previous scheduler's tail.
	 */
	get tailTime(): number {
		return this.dispatchedHorizon;
	}

	stop(): void {
		this.running = false;
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		if (this.rafHandle !== null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
		this.lastActive = null;
		this.cfg.onHighlight(null);
	}

	get isRunning(): boolean {
		return this.running;
	}

	private prime(startTime: number, countInBars: number | undefined): void {
		this.events = buildEventList({
			events: this.cfg.events,
			bars: this.cfg.bars,
			bpm: this.cfg.bpm,
			startTime,
			metronome: this.cfg.metronome,
			rhythmAudio: this.cfg.rhythmAudio,
			rhythmInstrument: this.cfg.rhythmInstrument,
			allowedLengths: this.cfg.allowedLengths,
			snareOnBackbeats: this.cfg.snareOnBackbeats,
			hihatSubdivision: this.cfg.hihatSubdivision,
			countInBars
		});
		this.highlights = this.events
			.filter((e): e is Extract<AudioEvent, { type: 'highlight' }> => e.type === 'highlight')
			.map((e) => ({ time: e.time, index: e.rhythmEventIndex }));
		this.nextEventIdx = 0;
		const secPerBar = (60 / this.cfg.bpm) * 4;
		const totalBars = (countInBars ?? 0) + this.cfg.bars;
		this.cycleEndTime = startTime + totalBars * secPerBar;
	}

	private tick(): void {
		const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_SEC;
		while (this.nextEventIdx < this.events.length) {
			const e = this.events[this.nextEventIdx];
			if (e.time > horizon) break;
			this.dispatch(e);
			this.nextEventIdx++;
		}
		if (this.nextEventIdx >= this.events.length && this.running) {
			if (this.cfg.loop) {
				// Re-prime as soon as the next cycle start enters the look-ahead
				// horizon so we can schedule the downbeat on time.
				if (this.cycleEndTime <= horizon) this.restartSeamless();
			} else if (this.ctx.currentTime >= this.cycleEndTime) {
				this.finish();
			}
		}
	}

	private finish(): void {
		this.stop();
		this.cfg.onComplete?.();
	}

	private restartSeamless(): void {
		// The next cycle starts exactly where the current one ends, so tempo
		// never rushes between repetitions.
		this.prime(this.cycleEndTime, 0);
	}

	private dispatch(e: AudioEvent): void {
		const synth = this.cfg.synth;
		switch (e.type) {
			case 'metronome':
				synth.playClick(e.time, e.emphasis);
				this.bumpHorizon(e.time);
				break;
			case 'kick':
				synth.playKick(e.time);
				this.bumpHorizon(e.time);
				break;
			case 'snare':
				synth.playSnare(e.time);
				this.bumpHorizon(e.time);
				break;
			case 'hihat':
				synth.playHihat(e.time);
				this.bumpHorizon(e.time);
				break;
			case 'bass':
				synth.playBass(e.time, e.durationSec);
				this.bumpHorizon(e.time + e.durationSec);
				break;
			case 'highlight':
				// Handled by the rAF loop reading ctx.currentTime directly.
				break;
		}
	}

	private bumpHorizon(t: number): void {
		if (t > this.dispatchedHorizon) this.dispatchedHorizon = t;
	}

	private highlightFrame(): void {
		if (!this.running) return;
		const now = this.ctx.currentTime;
		let active: number | null = null;
		for (const m of this.highlights) {
			if (m.time <= now) active = m.index;
			else break;
		}
		if (active !== this.lastActive) {
			this.lastActive = active;
			this.cfg.onHighlight(active);
		}
		this.rafHandle = requestAnimationFrame(() => this.highlightFrame());
	}
}
