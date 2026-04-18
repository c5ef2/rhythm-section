<script lang="ts">
	import Staff from '$lib/components/Staff.svelte';
	import NoteLengthPicker from '$lib/components/NoteLengthPicker.svelte';
	import { generateRhythm } from '$lib/rhythm/generator';
	import { persist, readInitialSettings } from '$lib/state/settings.svelte';
	import { randomSeed } from '$lib/rng/seeded';
	import { Scheduler } from '$lib/audio/scheduler';
	import { oscillatorClick } from '$lib/audio/osc-click';
	import { encodeShare } from '$lib/state/share';
	import type { NoteLength, MetronomeDivision } from '$lib/rhythm/types';
	import { browser } from '$app/environment';

	const NOTE_OPTIONS: { value: NoteLength; glyph: string; label: string }[] = [
		{ value: 'whole', glyph: '𝅝', label: 'whole' },
		{ value: 'half', glyph: '𝅗𝅥', label: 'half' },
		{ value: 'quarter', glyph: '♩', label: 'quarter' },
		{ value: 'eighth', glyph: '♪', label: '8th' },
		{ value: 'sixteenth', glyph: '𝅘𝅥𝅯', label: '16th' },
		{ value: 'eighth-triplet', glyph: '♪³', label: 'triplet' },
		{ value: 'dotted-half', glyph: '𝅗𝅥.', label: 'dot. half' },
		{ value: 'dotted-quarter', glyph: '♩.', label: 'dot. ¼' },
		{ value: 'dotted-eighth', glyph: '♪.', label: 'dot. 8th' }
	];

	const DIVISIONS: { value: MetronomeDivision; glyph: string }[] = [
		{ value: 'half', glyph: '𝅗𝅥' },
		{ value: 'quarter', glyph: '♩' },
		{ value: 'eighth', glyph: '♪' },
		{ value: 'triplet', glyph: '♪³' },
		{ value: 'sixteenth', glyph: '𝅘𝅥𝅯' }
	];

	let settings = $state(readInitialSettings());
	let activeIndex = $state<number | null>(null);
	let scheduler: Scheduler | null = null;
	let audioCtx: AudioContext | null = null;
	let isPlaying = $state(false);

	const rhythm = $derived(
		generateRhythm({
			bars: settings.bars,
			allowedLengths: settings.allowedLengths,
			allowRests: settings.allowRests,
			allowTies: settings.allowTies,
			seed: settings.seed
		})
	);

	$effect(() => {
		persist($state.snapshot(settings));
	});

	function regenerate() {
		settings.seed = randomSeed();
	}

	function togglePlay() {
		if (isPlaying) stop();
		else start();
	}

	function start() {
		if (!browser) return;
		audioCtx ??= new AudioContext();
		if (audioCtx.state === 'suspended') audioCtx.resume();
		scheduler?.stop();
		scheduler = new Scheduler({
			ctx: audioCtx,
			click: oscillatorClick(audioCtx),
			bars: settings.bars,
			bpm: settings.bpm,
			events: rhythm.events,
			metronome: settings.metronome,
			rhythmAudio: false,
			onHighlight: (i) => (activeIndex = i)
		});
		scheduler.start();
		isPlaying = true;
	}

	function stop() {
		scheduler?.stop();
		scheduler = null;
		isPlaying = false;
		activeIndex = null;
	}

	async function copyShareLink() {
		if (!browser) return;
		const url = new URL(window.location.href);
		url.hash = 's=' + encodeShare($state.snapshot(settings));
		await navigator.clipboard.writeText(url.toString());
	}

	function setDivision(d: MetronomeDivision) {
		settings.metronome = { ...settings.metronome, division: d };
	}

	function setBars(b: 1 | 2) {
		settings.bars = b;
	}
</script>

<svelte:head>
	<title>Rhythm Section</title>
</svelte:head>

<main>
	<header>
		<h1>Rhythm Section</h1>
		<p class="subtitle">Practice reading rhythms with a generated exercise and a metronome.</p>
	</header>

	<section class="card transport">
		<button class="primary play" type="button" onclick={togglePlay}>
			{isPlaying ? '⏸ Pause' : '▶ Play'}
		</button>
		<button type="button" onclick={regenerate}>↻ Regenerate</button>
		<label>
			BPM
			<input type="number" min="30" max="300" step="1" bind:value={settings.bpm} />
		</label>
		<div class="group">
			<span class="group-label">Bars</span>
			<button type="button" aria-pressed={settings.bars === 1} onclick={() => setBars(1)}>1</button>
			<button type="button" aria-pressed={settings.bars === 2} onclick={() => setBars(2)}>2</button>
		</div>
		<button type="button" class="share" onclick={copyShareLink}>⎘ Copy link</button>
	</section>

	<section class="card staff-card">
		<Staff events={rhythm.events} bars={settings.bars} {activeIndex} />
	</section>

	<section class="card settings">
		<div class="settings-row">
			<span class="group-label">Allowed note lengths</span>
			<NoteLengthPicker
				value={settings.allowedLengths}
				options={NOTE_OPTIONS}
				onChange={(next) => (settings.allowedLengths = next)}
			/>
		</div>
		<div class="settings-row">
			<label>
				<input type="checkbox" bind:checked={settings.allowRests} />
				Include rests
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.allowTies} />
				Include ties
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.countIn} />
				Count-in
			</label>
		</div>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<label>
				<input type="checkbox" bind:checked={settings.metronome.enabled} />
				Metronome
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.metronome.emphasizeFirstBeat} />
				Emphasize first beat
			</label>
		</div>
		<div class="settings-row">
			<span class="group-label">Division</span>
			<div class="group">
				{#each DIVISIONS as d (d.value)}
					<button
						type="button"
						aria-pressed={settings.metronome.division === d.value}
						onclick={() => setDivision(d.value)}
						title={d.value}
					>
						<span class="glyph">{d.glyph}</span>
					</button>
				{/each}
			</div>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 2rem auto 4rem;
		padding: 0 1.25rem;
		display: grid;
		gap: 1rem;
	}
	header h1 {
		margin: 0 0 0.25rem;
		letter-spacing: 0.01em;
	}
	.subtitle {
		margin: 0;
		color: var(--muted);
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.1rem;
		box-shadow: var(--shadow);
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.transport .play {
		min-width: 6.5rem;
	}
	.share {
		margin-left: auto;
	}
	.group {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.group button {
		background: transparent;
		border: 1px solid transparent;
		padding: 0.35rem 0.65rem;
	}
	.group-label {
		color: var(--muted);
		font-size: 0.85rem;
		margin-right: 0.25rem;
	}
	.staff-card {
		padding: 1rem;
		background: #ffffff;
		border-color: #e2e2e2;
	}
	.settings {
		display: grid;
		gap: 0.75rem;
	}
	.settings-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.glyph {
		font-family: 'Noto Music', 'Bravura Text', 'DejaVu Serif', serif;
		font-size: 1.2rem;
	}
</style>
