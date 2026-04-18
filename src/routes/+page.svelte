<script lang="ts">
	import { untrack } from 'svelte';
	import Staff from '$lib/components/Staff.svelte';
	import NoteIcon from '$lib/components/NoteIcon.svelte';
	import NoteLengthPicker from '$lib/components/NoteLengthPicker.svelte';
	import { appState } from '$lib/state/app-state.svelte';
	import * as actions from '$lib/state/actions.svelte';
	import { persist } from '$lib/state/settings.svelte';
	import type { MetronomeDivision, NoteLength } from '$lib/rhythm/types';

	const NOTE_OPTIONS: { value: NoteLength; label: string }[] = [
		{ value: 'whole', label: 'whole note' },
		{ value: 'half', label: 'half note' },
		{ value: 'quarter', label: 'quarter note' },
		{ value: 'eighth', label: 'eighth note' },
		{ value: 'sixteenth', label: 'sixteenth note' },
		{ value: 'eighth-triplet', label: 'eighth triplet' },
		{ value: 'dotted-half', label: 'dotted half' },
		{ value: 'dotted-quarter', label: 'dotted quarter' },
		{ value: 'dotted-eighth', label: 'dotted eighth' }
	];

	const DIVISIONS: { value: MetronomeDivision; length: NoteLength; label: string }[] = [
		{ value: 'half', length: 'half', label: 'half' },
		{ value: 'quarter', length: 'quarter', label: 'quarter' },
		{ value: 'eighth', length: 'eighth', label: 'eighth' },
		{ value: 'triplet', length: 'eighth-triplet', label: 'triplet' },
		{ value: 'sixteenth', length: 'sixteenth', label: 'sixteenth' }
	];

	// Keep settings snapshot in localStorage whenever they change.
	$effect(() => {
		persist($state.snapshot(appState.settings));
	});

	// Snap any out-of-notch BPM (e.g. from an older share URL) to the Maelzel scale.
	$effect(() => {
		void appState.settings.bpm;
		untrack(actions.normaliseBpm);
	});

	// Any change to playback-affecting state restarts the player while running.
	$effect(() => {
		const s = appState.settings;
		void s.bpm;
		void s.bars;
		void s.metronome.enabled;
		void s.metronome.division;
		void s.metronome.emphasizeFirstBeat;
		void s.countIn;
		void s.rhythmAudio;
		void s.rhythmInstrument;
		void s.loop;
		void appState.rhythm.events;
		untrack(() => {
			actions.restartIfPlaying();
		});
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		const target = e.target as HTMLElement | null;
		if (target && /^(input|textarea|button)$/i.test(target.tagName)) return;
		e.preventDefault();
		actions.togglePlay();
	}

	function onSoundFontFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) actions.loadSoundFontFile(file);
	}
</script>

<svelte:head>
	<title>Rhythm Section</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
	<header>
		<h1>Rhythm Section</h1>
		<p class="subtitle">Practice reading rhythms with a generated exercise and a metronome.</p>
	</header>

	<section class="card transport">
		<button class="primary play" type="button" onclick={actions.togglePlay}>
			{appState.isPlaying ? '⏸ Pause' : '▶ Play'}
		</button>
		<div class="transport-row">
			<button type="button" class="equal" onclick={actions.regenerate}>↻ Regenerate</button>
			<button
				type="button"
				class="equal"
				aria-pressed={appState.settings.loop}
				onclick={actions.toggleLoop}
				title="Loop playback"
			>
				⟳ Loop
			</button>
		</div>
		<div class="transport-row">
			<div class="bpm-stepper" role="group" aria-label="BPM">
				<span class="group-label">BPM</span>
				<button type="button" aria-label="Slower" onclick={() => actions.stepBpm(-1)}>−</button>
				<output>{appState.settings.bpm}</output>
				<button type="button" aria-label="Faster" onclick={() => actions.stepBpm(1)}>+</button>
			</div>
			<div class="group bars-group">
				<span class="group-label">Bars</span>
				<button
					type="button"
					aria-pressed={appState.settings.bars === 1}
					onclick={() => actions.setBars(1)}
				>
					1
				</button>
				<button
					type="button"
					aria-pressed={appState.settings.bars === 2}
					onclick={() => actions.setBars(2)}
				>
					2
				</button>
			</div>
		</div>
		<button type="button" class="share" onclick={actions.copyShareLink}>⎘ Copy link</button>
	</section>

	<section class="card staff-card">
		<Staff
			events={appState.rhythm.events}
			bars={appState.settings.bars}
			activeIndex={appState.activeIndex}
		/>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<span class="group-label">Allowed note lengths</span>
			<NoteLengthPicker
				value={appState.settings.allowedLengths}
				options={NOTE_OPTIONS}
				onChange={actions.setAllowedLengths}
			/>
		</div>
		<div class="settings-row">
			<label>
				<input
					type="checkbox"
					checked={appState.settings.allowRests}
					onchange={actions.toggleAllowRests}
				/>
				Include rests
			</label>
			<label>
				<input
					type="checkbox"
					checked={appState.settings.allowTies}
					onchange={actions.toggleAllowTies}
				/>
				Include ties
			</label>
			<label>
				<input
					type="checkbox"
					checked={appState.settings.countIn}
					onchange={actions.toggleCountIn}
				/>
				Count-in
			</label>
		</div>
		<div class="settings-row">
			<label>
				<input
					type="checkbox"
					checked={appState.settings.rhythmAudio}
					onchange={actions.toggleRhythmAudio}
				/>
				Play rhythm audio
			</label>
			<span class="group-label">Instrument</span>
			<div class="group">
				<button
					type="button"
					aria-pressed={appState.settings.rhythmInstrument === 'drum'}
					onclick={() => actions.setInstrument('drum')}>Drum</button
				>
				<button
					type="button"
					aria-pressed={appState.settings.rhythmInstrument === 'bass'}
					onclick={() => actions.setInstrument('bass')}>Bass</button
				>
			</div>
		</div>
		<div class="settings-row">
			<span class="group-label">SoundFont</span>
			<label class="file-button">
				<input type="file" accept=".sf2,.sf3,.dls" onchange={onSoundFontFile} />
				<span>Load .sf2 / .sf3</span>
			</label>
			{#if appState.soundFontStatus === 'loading'}
				<span class="status">Loading {appState.soundFontName}…</span>
			{:else if appState.soundFontStatus === 'loaded'}
				<span class="status ok">✓ {appState.soundFontName}</span>
			{:else if appState.soundFontStatus === 'error'}
				<span class="status err">Failed to load</span>
			{:else}
				<span class="status muted">Using synthesised fallback</span>
			{/if}
		</div>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<label>
				<input
					type="checkbox"
					checked={appState.settings.metronome.enabled}
					onchange={actions.toggleMetronome}
				/>
				Metronome
			</label>
			<label>
				<input
					type="checkbox"
					checked={appState.settings.metronome.emphasizeFirstBeat}
					onchange={actions.toggleEmphasizeFirstBeat}
				/>
				Emphasize first beat
			</label>
		</div>
		<div class="settings-row">
			<span class="group-label">Division</span>
			<div class="group">
				{#each DIVISIONS as d (d.value)}
					<button
						type="button"
						class="icon-btn"
						aria-pressed={appState.settings.metronome.division === d.value}
						onclick={() => actions.setMetronomeDivision(d.value)}
						aria-label={d.label}
						title={d.label}
					>
						<NoteIcon length={d.length} size={18} />
					</button>
				{/each}
			</div>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 1.25rem auto 4rem;
		padding: 0 1rem max(1rem, env(safe-area-inset-bottom));
		display: grid;
		gap: 1rem;
	}
	@supports (padding: max(0px)) {
		main {
			padding-left: max(1rem, env(safe-area-inset-left));
			padding-right: max(1rem, env(safe-area-inset-right));
		}
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
		min-width: 0;
	}
	.transport {
		display: grid;
		gap: 0.6rem;
	}
	.transport-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.transport .play {
		width: 100%;
		min-height: 3rem;
		font-size: 1.05rem;
	}
	.transport .equal {
		flex: 1 1 0;
	}
	.transport .share {
		width: 100%;
	}
	.bpm-stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.4rem;
		flex: 1 1 auto;
	}
	.bpm-stepper button {
		background: transparent;
		border: none;
		padding: 0.35rem 0.65rem;
		font-weight: 600;
		min-height: 2.25rem;
		flex: 0 0 auto;
	}
	.bpm-stepper button:hover {
		background: var(--panel);
	}
	.bpm-stepper output {
		min-width: 2.75rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		flex: 1 1 auto;
	}
	.bars-group {
		flex: 0 0 auto;
	}
	.bars-group button {
		min-width: 2.5rem;
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
		color: var(--text);
		padding: 0.35rem 0.65rem;
	}
	.group button[aria-pressed='true'] {
		background: linear-gradient(180deg, var(--brand) 0%, var(--brand-2) 100%);
		color: #0b1024;
		border-color: transparent;
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
		overflow-x: auto;
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
	.icon-btn {
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.file-button {
		display: inline-flex;
		align-items: center;
	}
	.file-button input[type='file'] {
		display: none;
	}
	.file-button span {
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
	.file-button:hover span {
		background: #262e4d;
	}
	.status {
		font-size: 0.85rem;
		color: var(--text);
	}
	.status.muted {
		color: var(--muted);
	}
	.status.ok {
		color: #6dd3a3;
	}
	.status.err {
		color: var(--danger);
	}

	@media (max-width: 640px) {
		header h1 {
			font-size: 1.4rem;
		}
		.subtitle {
			font-size: 0.9rem;
		}
		.icon-btn {
			width: 2.75rem;
			height: 2.75rem;
		}
		:global(.rhythm-note-active) {
			stroke-width: 1.5px;
		}
	}
</style>
