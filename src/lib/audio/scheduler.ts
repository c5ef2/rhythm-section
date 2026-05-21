import { buildEventList, type AudioEvent, type BuildEventListInput } from './events';

const LOOKAHEAD_MS = 25;
/**
 * Minimum scheduling-look-ahead window. The actual look-ahead grows with
 * `AudioContext.outputLatency` so Bluetooth output devices (which add
 * 150–300 ms of latency) still receive each scheduled audio event in time
 * to render — at the default 100 ms a BT-routed event is effectively in
 * the past for the output buffer and gets clipped or dropped, which
 * surfaces to the user as "notes are barely audible / cut short over BT".
 */
const MIN_SCHEDULE_AHEAD_SEC = 0.1;
const MIN_START_PREROLL_SEC = 0.05;
/**
 * How many output-latency windows to absorb on top of the minimums. A factor
 * of 2 means we always lead the output buffer by at least one full latency
 * cycle plus a safety margin.
 */
const LATENCY_SAFETY_FACTOR = 2;

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
	 * Floor for the latency we plan against, in seconds. The Player sets
	 * this to a BT-typical value (~0.25 s) when it believes the sink is
	 * Bluetooth, which lets us schedule with enough lead time even when
	 * `ctx.outputLatency` is stuck at the wired value the context had
	 * when it was created (most browsers freeze it). Without this, every
	 * event scheduled in BT mode arrives too late and the BT codec drops
	 * or clips it — keep-alive on its own doesn't help.
	 */
	minLatencyHint?: number;
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
	private minLatencyHint: number;
	/**
	 * Audio-context time at which the CURRENT cycle ends (= startTime of the
	 * next cycle when looping). Computed once per cycle so seamless loop
	 * restarts land exactly on the downbeat instead of drifting forward based
	 * on where the last scheduled event happened to be.
	 */
	private cycleEndTime = 0;

	constructor(config: SchedulerConfig) {
		this.ctx = config.ctx;
		this.cfg = config;
		this.minLatencyHint = config.minLatencyHint ?? 0;
	}

	/**
	 * Update the latency floor mid-cycle. Used when the user (or the
	 * Player's devicechange hook) flips BT mode on/off while audio is
	 * already playing; the next `tick()` will use the new value.
	 */
	setMinLatencyHint(seconds: number): void {
		this.minLatencyHint = Math.max(0, seconds);
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		const startTime = this.ctx.currentTime + this.startPreroll();
		this.prime(startTime, this.cfg.countInBars);
		this.tick();
		this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
		this.rafHandle = requestAnimationFrame(() => this.highlightFrame());
	}

	private outputLatency(): number {
		// Browsers that don't expose outputLatency report 0 / undefined; treat
		// those as "low latency" — typical for built-in speakers anyway. The
		// minLatencyHint floor lets the Player force BT-sized planning when
		// it knows better than ctx.outputLatency (which is sticky).
		const reported = (this.ctx as { outputLatency?: number }).outputLatency;
		const reportedNum = typeof reported === 'number' && reported > 0 ? reported : 0;
		return Math.max(reportedNum, this.minLatencyHint);
	}

	private startPreroll(): number {
		return Math.max(MIN_START_PREROLL_SEC, this.outputLatency() * LATENCY_SAFETY_FACTOR);
	}

	private scheduleAheadSec(): number {
		return Math.max(MIN_SCHEDULE_AHEAD_SEC, this.outputLatency() * LATENCY_SAFETY_FACTOR);
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
		const horizon = this.ctx.currentTime + this.scheduleAheadSec();
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
				break;
			case 'kick':
				synth.playKick(e.time);
				break;
			case 'snare':
				synth.playSnare(e.time);
				break;
			case 'hihat':
				synth.playHihat(e.time);
				break;
			case 'bass':
				synth.playBass(e.time, e.durationSec);
				break;
			case 'highlight':
				// Handled by the rAF loop reading ctx.currentTime directly.
				break;
		}
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
