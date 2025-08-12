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

	// Tilt
	export let enableTilt = true;
	export let tiltMaxRotateDeg = 14;
	export let tiltScale = 1.04;
	export let tiltTransitionMs = 120;

	let wrapperEl: HTMLDivElement | null = null;

	function handleMouseMove(e: MouseEvent) {
		if (!enableTilt || !wrapperEl) return;
		const r = wrapperEl.getBoundingClientRect();
		const px = (e.clientX - r.left) / r.width;
		const py = (e.clientY - r.top) / r.height;
		const rotY = (px - 0.5) * 2 * tiltMaxRotateDeg;
		const rotX = -(py - 0.5) * 2 * tiltMaxRotateDeg;
		wrapperEl.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${tiltScale})`;
	}

	function handleMouseLeave() {
		if (!wrapperEl) return;
		wrapperEl.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
	}

	function handleMouseEnter() {
		if (!wrapperEl) return;
		wrapperEl.style.transition = `transform ${tiltTransitionMs}ms ease`;
	}
</script>

<div
	bind:this={wrapperEl}
	on:mousemove={handleMouseMove}
	on:mouseleave={handleMouseLeave}
	on:mouseenter={handleMouseEnter}
	aria-label={titleText ?? 'card'}
	style={`position:relative;width:100%;aspect-ratio:${aspectWidth}/${aspectHeight};overflow:hidden;border-radius:8px;transform:perspective(900px);will-change:transform;`}
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
