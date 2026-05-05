<script lang="ts">
	import type { NoteLength } from '$lib/rhythm/types';

	interface Props {
		length: NoteLength;
		size?: number;
	}
	let { length, size = 24 }: Props = $props();

	const FLAGS: Record<string, number> = { eighth: 1, sixteenth: 2, 'dotted-eighth': 1 };
	const isHollow = $derived(length === 'half');
	const hasDot = $derived(length === 'dotted-eighth');
	const flagCount = $derived(FLAGS[length] ?? 0);
	const isTriplet = $derived(length === 'eighth-triplet');
</script>

<!-- 32×32 viewBox; glyph drawn centered both horizontally and vertically. -->
<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
>
	{#if isTriplet}
		<g transform="translate(2 0)">
			<ellipse cx="4" cy="24" rx="3.2" ry="2.2" fill="currentColor" transform="rotate(-18 4 24)" />
			<ellipse
				cx="14"
				cy="24"
				rx="3.2"
				ry="2.2"
				fill="currentColor"
				transform="rotate(-18 14 24)"
			/>
			<ellipse
				cx="24"
				cy="24"
				rx="3.2"
				ry="2.2"
				fill="currentColor"
				transform="rotate(-18 24 24)"
			/>
			<line x1="7" y1="23" x2="7" y2="9" />
			<line x1="17" y1="23" x2="17" y2="9" />
			<line x1="27" y1="23" x2="27" y2="9" />
			<line x1="6" y1="9" x2="28" y2="9" stroke-width="2.4" />
			<text
				x="16"
				y="6"
				font-size="7"
				text-anchor="middle"
				fill="currentColor"
				stroke="none"
				font-weight="600">3</text
			>
		</g>
	{:else}
		{@const cx = 11}
		{@const cy = 22}
		{@const stemX = cx + 3.5}
		<ellipse
			cx={cx}
			cy={cy}
			rx="4.4"
			ry="3.1"
			transform={`rotate(-20 ${cx} ${cy})`}
			fill={isHollow ? 'none' : 'currentColor'}
		/>
		{#if hasDot}
			<circle cx={cx + 7} cy={cy} r="1.2" fill="currentColor" stroke="none" />
		{/if}
		<line x1={stemX} y1={cy - 1.2} x2={stemX} y2="6" />
		{#if flagCount >= 1}
			<path d={`M ${stemX} 6 Q ${stemX + 8} 10 ${stemX + 5} 16`} stroke-width="1.8" />
		{/if}
		{#if flagCount >= 2}
			<path d={`M ${stemX} 10 Q ${stemX + 8} 14 ${stemX + 5} 20`} stroke-width="1.8" />
		{/if}
	{/if}
</svg>
