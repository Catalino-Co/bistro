<script lang="ts">
	import { ICONS, type IconName } from '$lib/icons.js';

	interface Props {
		name: IconName;
		size?: number;
	}

	let { name, size = 20 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each ICONS[name].split(' M') as segment, i (i)}
		<path d={i === 0 ? segment : `M${segment}`} />
	{/each}
</svg>
