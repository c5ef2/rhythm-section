import type { ClickSink } from './scheduler';

/**
 * Minimal oscillator-based metronome click used until the SpessaSynth
 * soundfont is wired in. Downbeat is a brighter, slightly louder blip.
 */
export function oscillatorClick(ctx: AudioContext): ClickSink {
	return {
		playClick(time, emphasis) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			const freq = emphasis === 'downbeat' ? 1600 : emphasis === 'onbeat' ? 1000 : 700;
			const peak = emphasis === 'downbeat' ? 0.5 : 0.35;

			osc.type = 'square';
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.0001, time);
			gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
			gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

			osc.connect(gain).connect(ctx.destination);
			osc.start(time);
			osc.stop(time + 0.06);
		}
	};
}
