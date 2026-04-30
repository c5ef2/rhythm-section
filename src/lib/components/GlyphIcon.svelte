<script lang="ts">
	export type Glyph = 'rest' | 'tie' | 'snare' | 'hihat';

	interface Props {
		glyph: Glyph;
		size?: number;
	}
	let { glyph, size = 24 }: Props = $props();
</script>

<!-- 32×32 viewBox to match NoteIcon. -->
<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if glyph === 'rest'}
		<!-- Stylised quarter rest. -->
		<path d="M14 6 q3 3 0 6 q-3 3 1 6" stroke-width="2" />
		<path d="M14 18 q4 1 5 4 q1 3 -2 4" stroke-width="2" />
		<circle cx="14" cy="22" r="1.5" fill="currentColor" stroke="none" />
	{:else if glyph === 'tie'}
		<!-- Two noteheads connected by a tie arc. -->
		<ellipse cx="9" cy="22" rx="3.2" ry="2.2" transform="rotate(-18 9 22)" fill="currentColor" />
		<ellipse cx="23" cy="22" rx="3.2" ry="2.2" transform="rotate(-18 23 22)" fill="currentColor" />
		<path d="M8 18 q8 -8 16 0" stroke-width="1.6" />
	{:else if glyph === 'snare'}
		<!-- Drum side cylinder + snare wires across the bottom. -->
		<rect x="6" y="11" width="20" height="11" rx="1.5" />
		<line x1="6" y1="14" x2="26" y2="14" />
		<line x1="6" y1="19" x2="26" y2="19" />
		<line x1="9" y1="22" x2="9" y2="26" />
		<line x1="23" y1="22" x2="23" y2="26" />
		<line x1="9" y1="26" x2="23" y2="26" />
	{:else if glyph === 'hihat'}
		<!-- Two cymbals on a stand. -->
		<line x1="16" y1="14" x2="16" y2="26" stroke-width="2" />
		<ellipse cx="16" cy="12" rx="10" ry="2.2" />
		<ellipse cx="16" cy="15" rx="10" ry="2.2" />
		<line x1="13" y1="26" x2="19" y2="26" />
	{/if}
</svg>
