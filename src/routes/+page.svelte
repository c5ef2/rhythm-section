<script lang="ts">
	import Staff from '$lib/components/Staff.svelte';
	import { generateRhythm } from '$lib/rhythm/generator';
	import { readInitialSettings } from '$lib/state/settings.svelte';
	import { randomSeed } from '$lib/rng/seeded';

	let settings = $state(readInitialSettings());
	let rhythm = $derived(
		generateRhythm({
			bars: settings.bars,
			allowedLengths: settings.allowedLengths,
			allowRests: settings.allowRests,
			allowTies: settings.allowTies,
			seed: settings.seed
		})
	);

	function regenerate() {
		settings.seed = randomSeed();
	}
</script>

<svelte:head>
	<title>Rhythm Section</title>
</svelte:head>

<main>
	<h1>Rhythm Section</h1>
	<p>BPM: {settings.bpm} · Bars: {settings.bars} · Seed: {settings.seed}</p>
	<Staff events={rhythm.events} bars={settings.bars} activeIndex={null} />
	<button type="button" onclick={regenerate}>Regenerate</button>
</main>

<style>
	main {
		max-width: 900px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
</style>
