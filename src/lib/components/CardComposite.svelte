<script lang="ts">
	export let artImageUrl: string;
	export let frameImageUrl: string;
	export let titleImageUrl: string | null = null;
	export let titleText: string | null = null;
	export let aspectWidth = 430;
	export let aspectHeight = 670;
	export let artObjectFit: 'cover' | 'contain' = 'cover';

	export let titleTopPercent = 3;
	export let titleLeftPercent = 29;
	export let titleHeightPercent = 18;
</script>

<div
	aria-label={titleText ?? 'card'}
	style={`position:relative;width:100%;aspect-ratio:${aspectWidth}/${aspectHeight};overflow:hidden;border-radius:8px;`}
>
	<img
		src={artImageUrl}
		alt={titleText ?? 'card-art'}
		style={`position:absolute;inset:0;width:100%;height:100%;object-fit:${artObjectFit};display:block;z-index:0;`}
		loading="eager"
		decoding="sync"
		draggable="false"
	/>
	<img
		src={frameImageUrl}
		alt="card-frame"
		style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1;"
		loading="eager"
		decoding="sync"
		draggable="false"
	/>
	{#if titleImageUrl}
		<img
			src={titleImageUrl}
			alt="card-title-frame"
			style={`position:absolute;left:${titleLeftPercent}%;top:${titleTopPercent}%;height:${titleHeightPercent}%;width:auto;display:block;pointer-events:none;z-index:2;`}
			loading="eager"
			decoding="sync"
			draggable="false"
		/>
	{/if}
	{#if titleText}
		<div
			style={`position:absolute;left:${titleLeftPercent}%;top:${titleTopPercent}%;height:${titleHeightPercent}%;display:flex;align-items:normal;justify-content:center;text-align:center;color:whitesmoke;font-weight:700;font-size:clamp(9px,2.4vw,20px);line-height:1;letter-spacing:.5px;padding:0.3rem 0px 0px 0.7rem;z-index:3;pointer-events:none;`}
		>
			{titleText}
		</div>
	{/if}
</div>
