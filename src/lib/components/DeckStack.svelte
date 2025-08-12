<script lang="ts">
	export let deckCount: number;
	export let cardBackImageUrl: string;
	export let aspectWidth = 430;
	export let aspectHeight = 670;
	export let maxVisible = 20;
	export let offsetXPx = 2;
	export let offsetYPx = 1;

	$: visibleCount = Math.min(deckCount, maxVisible);
	$: layers = Array.from({ length: visibleCount }, (_, i) => i);
</script>

<div
	style="position:relative;width:clamp(90px,18vw,160px);aspect-ratio:{aspectWidth}/{aspectHeight};"
>
	{#each layers as i (i)}
		<div
			style="position:absolute;inset:0;border-radius:10px;overflow:hidden;pointer-events:none;"
			style:transform={`translate(${i * offsetXPx}px, ${i * offsetYPx}px)`}
			style:z-index={i}
		>
			<img
				src={cardBackImageUrl}
				alt="deck-card-back"
				style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;"
				loading="eager"
				decoding="sync"
				draggable="false"
			/>
		</div>
	{/each}
</div>
