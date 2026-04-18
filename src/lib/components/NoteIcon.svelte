<script lang="ts">
	import type { NoteLength } from '$lib/rhythm/types';

	interface Props {
		length: NoteLength;
		size?: number;
	}
	let { length, size = 22 }: Props = $props();

	const FLAGS: Record<string, number> = { eighth: 1, sixteenth: 2, 'dotted-eighth': 1 };
	const isHollow = $derived(length === 'whole' || length === 'half' || length === 'dotted-half');
	const hasStem = $derived(length !== 'whole');
	const hasDot = $derived(
		length === 'dotted-half' || length === 'dotted-quarter' || length === 'dotted-eighth'
	);
	const flagCount = $derived(FLAGS[length] ?? 0);
	const isTriplet = $derived(length === 'eighth-triplet');
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 28 28"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	stroke-linecap="round"
>
	{#if isTriplet}
		<!-- Three beamed eighths + superscript 3 -->
		<g>
			<ellipse cx="4" cy="20" rx="3" ry="2" fill="currentColor" transform="rotate(-18 4 20)" />
			<ellipse cx="13" cy="20" rx="3" ry="2" fill="currentColor" transform="rotate(-18 13 20)" />
			<ellipse cx="22" cy="20" rx="3" ry="2" fill="currentColor" transform="rotate(-18 22 20)" />
			<line x1="7" y1="19" x2="7" y2="7" />
			<line x1="16" y1="19" x2="16" y2="7" />
			<line x1="25" y1="19" x2="25" y2="7" />
			<line x1="7" y1="7" x2="25" y2="7" stroke-width="2.2" />
			<text x="14" y="5" font-size="6" text-anchor="middle" fill="currentColor" stroke="none">3</text>
		</g>
	{:else}
		<!-- Note head -->
		<ellipse
			cx="9"
			cy="20"
			rx="4.2"
			ry="3"
			transform="rotate(-20 9 20)"
			fill={isHollow ? 'none' : 'currentColor'}
		/>
		{#if hasDot}
			<circle cx="16" cy="20" r="1.1" fill="currentColor" stroke="none" />
		{/if}
		{#if hasStem}
			<line x1="12.7" y1="19" x2="12.7" y2="4" />
		{/if}
		{#if flagCount >= 1}
			<path
				d="M12.7 4 Q20 8 17 14"
				stroke="currentColor"
				stroke-width="1.6"
				fill="none"
			/>
		{/if}
		{#if flagCount >= 2}
			<path
				d="M12.7 8 Q20 12 17 18"
				stroke="currentColor"
				stroke-width="1.6"
				fill="none"
			/>
		{/if}
	{/if}
</svg>
