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
		<!--
			Authentic Bravura eighth-rest glyph (path provided by the user).
			The original lived in a 10.03×17.67 viewBox under nested transforms
			(outer translate(-482.02,-143.62) + matrix(1.8,0,0,1.8,-471.41,9.46)).
			Collapsed and re-anchored into our 32×32 viewBox the combined
			transform becomes matrix(2.448 0 0 2.448 -1287.46 -178.46), which
			centres the glyph horizontally and gives it ~24 px of height.
		-->
		<g transform="matrix(2.448 0 0 2.448 -1287.46 -178.46)" fill="currentColor" stroke="none">
			<path
				d="M 531.098,74.847 C 530.578,74.945 530.18,75.304 530,75.8 C 529.961,75.96 529.961,75.999 529.961,76.218 C 529.961,76.519 529.98,76.679 530.121,76.917 C 530.32,77.316 530.738,77.636 531.215,77.753 C 531.715,77.894 532.551,77.773 533.508,77.456 L 533.746,77.374 L 532.57,80.624 L 531.414,83.87 C 531.414,83.87 531.453,83.89 531.516,83.933 C 531.633,84.011 531.832,84.07 531.973,84.07 C 532.211,84.07 532.512,83.933 532.551,83.812 C 532.551,83.773 533.109,81.878 533.785,79.628 L 534.98,75.503 L 534.941,75.445 C 534.844,75.324 534.645,75.285 534.523,75.382 C 534.484,75.421 534.422,75.503 534.383,75.562 C 534.203,75.863 533.746,76.398 533.508,76.597 C 533.289,76.777 533.168,76.796 532.969,76.718 C 532.789,76.62 532.73,76.519 532.609,75.98 C 532.492,75.445 532.352,75.202 532.051,75.003 C 531.773,74.824 531.414,74.765 531.098,74.847 z"
			/>
		</g>
	{:else if glyph === 'tie'}
		<!-- Two noteheads with a tie arc curving below (matches engraving). -->
		<ellipse cx="9" cy="14" rx="3.4" ry="2.4" transform="rotate(-18 9 14)" fill="currentColor" />
		<ellipse cx="23" cy="14" rx="3.4" ry="2.4" transform="rotate(-18 23 14)" fill="currentColor" />
		<path d="M8 18 q8 8 16 0" stroke-width="1.8" fill="none" />
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
