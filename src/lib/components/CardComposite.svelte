<script lang="ts">
	import { onMount } from 'svelte';

	export let artImageUrl: string;
	export let frameImageUrl: string;
	export let titleImageUrl: string | null = null;
	export let titleText: string | null = null;
	export let aspectWidth = 430;
	export let aspectHeight = 670;
	export let artObjectFit: 'cover' | 'contain' = 'cover';
	export let titleTopPercent = 3;
	export let titleLeftPercent = 29;
	export let titleTextTopPercent = -1.5;
	export let titleTextLeftPercent = 32;
	export let titleHeightPercent = 18;
	export let enableTilt = true;
	export let tiltMaxRotateDeg = 14;
	export let tiltScale = 1.04;
	export let tiltTransitionMs = 120;
	export let descriptionText: string = '';
	export let magicValue: number = 0;
	export let mightValue: number = 0;
	export let fireValue: number = 0;
	export let cornerNumberValue: number = 1;

	let wrapperEl: HTMLDivElement | null = null;
	let cachedBoundingRect: DOMRect | null = null;
	let scheduledAnimationFrameId: number | null = null;
	let pendingRotateXDeg = 0;
	let pendingRotateYDeg = 0;

	function updateCachedBoundingRect() {
		if (wrapperEl) cachedBoundingRect = wrapperEl.getBoundingClientRect();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!enableTilt || !wrapperEl) return;
		if (!cachedBoundingRect) updateCachedBoundingRect();
		const r = cachedBoundingRect!;
		const px = (e.clientX - r.left) / r.width;
		const py = (e.clientY - r.top) / r.height;
		pendingRotateYDeg = (px - 0.5) * 2 * tiltMaxRotateDeg;
		pendingRotateXDeg = -(py - 0.5) * 2 * tiltMaxRotateDeg;
		if (scheduledAnimationFrameId === null) {
			scheduledAnimationFrameId = requestAnimationFrame(() => {
				if (wrapperEl) {
					wrapperEl.style.transform = `translateZ(0) perspective(900px) rotateX(${pendingRotateXDeg}deg) rotateY(${pendingRotateYDeg}deg) scale(${tiltScale})`;
				}
				scheduledAnimationFrameId = null;
			});
		}
	}

	function handleMouseLeave() {
		if (!wrapperEl) return;
		if (scheduledAnimationFrameId !== null) cancelAnimationFrame(scheduledAnimationFrameId);
		scheduledAnimationFrameId = null;
		wrapperEl.style.transform =
			'translateZ(0) perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
	}

	function handleMouseEnter() {
		if (!wrapperEl) return;
		wrapperEl.style.transition = `transform ${tiltTransitionMs}ms ease`;
		updateCachedBoundingRect();
	}

	function makeBadge(iconPath: string, value: number, labelText: string) {
		return { iconPath, value, labelText };
	}

	$: magicBadge = makeBadge('/icons/magic_icon.png', magicValue, 'MAGIA');
	$: mightBadge = makeBadge('/icons/strength_icon.png', mightValue, 'FORÇA');
	$: fireBadge = makeBadge('/icons/fire_icon.png', fireValue, 'FOGO');

	$: tooltipText = descriptionText
		? `${titleText ?? 'Card'} — ${descriptionText}`
		: (titleText ?? 'Card');

	onMount(() => {
		const ro = new ResizeObserver(updateCachedBoundingRect);
		if (wrapperEl) ro.observe(wrapperEl);
		return () => ro.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperEl}
	on:pointermove={handlePointerMove}
	on:mouseleave={handleMouseLeave}
	on:mouseenter={handleMouseEnter}
	aria-label={titleText ?? 'card'}
	title={tooltipText}
	class="card-font"
	style={`position:relative;width:100%;aspect-ratio:${aspectWidth}/${aspectHeight};overflow:hidden;border-radius:5px;transform:translateZ(0) perspective(900px);will-change:transform;container-type:size;container-name:card;`}
>
	<div style="position:absolute;inset:0;display:flex;flex-direction:column;width:100%;height:100%;">
		<div style="position:relative;width:100%;height:70%;z-index:0;">
			<img
				src={artImageUrl}
				alt={titleText ?? 'card-art'}
				style={`position:absolute;inset:0;width:100%;height:100%;object-fit:${artObjectFit};display:block;padding: 6% 6% 0 6%;`}
				loading="eager"
				decoding="sync"
				draggable="false"
			/>
		</div>

		<div
			style="
        position:relative;height:30%;
        padding:0 2cqw 6cqh 2cqw;
        display:flex;justify-content:center;align-items:center;gap:3cqw;
        background-image:url('/frames/attributeBackground.png');
        background-size:cover;
        background-position:center bottom;
        background-repeat:no-repeat;
        border-top: 0.25cqh solid rgba(255,255,255,.18);
        z-index:0;
      "
		>
			{#each [magicBadge, mightBadge, fireBadge] as b}
				<div style="display:flex;flex-direction:column;align-items:center;gap:1.4cqh;min-width:0;">
					<div
						style="
              position:relative;
              width:15cqh;
              height:15cqh;
              background-image:url({b.iconPath});
              background-size:contain;
              background-repeat:no-repeat;
              background-position:center;
              flex:0 0 auto;
            "
						aria-label={b.labelText}
					>
						<div
							class="card-attribute-value"
							style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:5cqh;"
						>
							{b.value}
						</div>
					</div>
					<div
						class="card-attribute-label"
						style="font-size:3cqh;line-height:1;white-space:nowrap;"
					>
						{b.labelText}
					</div>
				</div>
			{/each}
		</div>
	</div>

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
			class="card-title-text"
			style={`position:absolute;left:${titleTextLeftPercent}%;top:${titleTextTopPercent}%;height:${titleHeightPercent}%;display:flex;align-items:center;justify-content:center;text-align:center;z-index:3;pointer-events:none;`}
		>
			{titleText}
		</div>
	{/if}

	<div
		class="card-corner-number"
		style="position:absolute;top:7.5cqh;right:8.5cqw;width:3.8cqh;height:3.8cqh;display:flex;align-items:center;justify-content:center;z-index:3;font-size:6cqh;pointer-events:none;"
	>
		{cornerNumberValue}
	</div>
</div>
