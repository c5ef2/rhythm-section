<script lang="ts">
	import { renderRhythm, setActiveNote } from '$lib/notation/render';
	import type { RhythmEvent } from '$lib/rhythm/types';

	interface Props {
		events: RhythmEvent[];
		bars: number;
		activeIndex: number | null;
	}

	let { events, bars, activeIndex }: Props = $props();

	let host: HTMLDivElement;
	let availableWidth = $state(0);
	let highlightElements = $state<SVGElement[][]>([]);

	$effect(() => {
		if (!host) return;
		const observer = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width ?? 0;
			if (w > 0) availableWidth = w;
		});
		observer.observe(host);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!host || availableWidth <= 0) return;
		const result = renderRhythm(host, events, bars, availableWidth);
		highlightElements = result.highlightElements;
	});

	$effect(() => {
		setActiveNote(highlightElements, activeIndex);
	});
</script>

<div class="staff" bind:this={host}></div>

<style>
	.staff {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		min-width: 0;
	}
	.staff :global(svg) {
		display: block;
		max-width: 100%;
		height: auto;
		margin: 0 auto;
	}
	/*
	 * VexFlow renders the notehead, stem, and flag as separate children (path
	 * / rect / line) that each set their own fill/stroke presentation
	 * attributes. A rule on the parent group alone only repaints pieces that
	 * don't specify fill/stroke themselves (the notehead path inherits fill,
	 * the stem does not). Explicitly repaint every descendant.
	 */
	.staff :global(.rhythm-note-active),
	.staff :global(.rhythm-note-active *) {
		fill: var(--accent);
		stroke: var(--accent);
	}
</style>
