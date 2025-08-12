<script lang="ts">
	export let artImageUrl: string;
	export let frameImageUrl: string;
	export let labelTitle: string | null = null;
	export let aspectWidth = 430;
	export let aspectHeight = 670;
	export let artObjectFit: 'cover' | 'contain' = 'cover';
</script>

<div
	aria-label={labelTitle ?? 'card'}
	style={`position:relative;width:100%;aspect-ratio:${aspectWidth}/${aspectHeight};overflow:hidden;border-radius:8px;`}
>
	<img
		src={artImageUrl}
		alt={labelTitle ?? 'card-art'}
		style="position:absolute;inset:0;width:100%;height:100%;object-fit:var(--fit);display:block;"
		loading="eager"
		decoding="sync"
		draggable="false"
		{...{
			style: `position:absolute;inset:0;width:100%;height:100%;object-fit:${artObjectFit};display:block;`
		}}
	/>
	<img
		src={frameImageUrl}
		alt="card-frame"
		style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;"
		loading="eager"
		decoding="sync"
		draggable="false"
	/>
</div>
