<script lang="ts">
	export let deckCount: number;
	export let cardBackImageUrl: string;

	export let aspectWidth = 430;
	export let aspectHeight = 670;

	export let maxVisible = 7;
	export let offsetXPx = 3;
	export let offsetYPx = 2;
	export let rotateStepDeg = 0.6;

	export let flipDurationMs = 700;

	export let frontArtImageUrl: string | null = null;
	export let frontFrameImageUrl: string | null = null;
	export let frontTitleImageUrl: string | null = null;
	export let frontTitleText: string | null = null;

	let previousCount = deckCount;
	let showFlipOverlay = false;
	let flipKey = 0;

	$: visibleCount = Math.min(deckCount, maxVisible);
	$: layers = Array.from({ length: visibleCount }, (_, i) => i);

	$: if (deckCount < previousCount) {
		if (frontArtImageUrl) {
			showFlipOverlay = true;
			flipKey = Date.now();
			setTimeout(() => {
				showFlipOverlay = false;
			}, flipDurationMs);
		}
		previousCount = deckCount;
	} else {
		previousCount = deckCount;
	}
</script>

<div
	style="position:relative;width:clamp(90px,18vw,160px);aspect-ratio:{aspectWidth}/{aspectHeight};perspective:1000px;"
>
	{#each layers as i (i)}
		<div
			style="position:absolute;inset:0;border-radius:10px;overflow:hidden;pointer-events:none;"
			style:transform={`translate(${i * offsetXPx}px, ${i * offsetYPx}px) rotate(${i * rotateStepDeg}deg)`}
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

	{#if showFlipOverlay}
		<div
			key={flipKey}
			style="position:absolute;inset:0;transform-style:preserve-3d;border-radius:10px;overflow:hidden;pointer-events:none;"
			class="flip-anim"
		>
			<div style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(0deg);">
				<img
					src={cardBackImageUrl}
					alt="back"
					style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;"
					loading="eager"
					decoding="sync"
					draggable="false"
				/>
			</div>

			<div style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);">
				<div style="position:relative;width:100%;height:100%;">
					<img
						src={frontArtImageUrl ?? ''}
						alt={frontTitleText ?? 'card-front-art'}
						style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0;"
						loading="eager"
						decoding="sync"
						draggable="false"
					/>
					{#if frontFrameImageUrl}
						<img
							src={frontFrameImageUrl}
							alt="front-frame"
							style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1;"
							loading="eager"
							decoding="sync"
							draggable="false"
						/>
					{/if}
					{#if frontTitleImageUrl}
						<img
							src={frontTitleImageUrl}
							alt="front-title"
							style="position:absolute;left:29%;top:3%;height:18%;width:auto;display:block;pointer-events:none;z-index:2;"
							loading="eager"
							decoding="sync"
							draggable="false"
						/>
					{/if}
					{#if frontTitleText}
						<div
							style="position:absolute;left:29%;top:3%;height:18%;display:flex;align-items:normal;justify-content:center;text-align:center;color:whitesmoke;font-weight:700;font-size:clamp(9px,2.2vw,18px);line-height:1;letter-spacing:.5px;padding:.3rem 0 0 .7rem;z-index:3;pointer-events:none;"
						>
							{frontTitleText}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.flip-anim {
		animation: flipY var(--flip-ms, 700ms) ease both;
	}
	@keyframes flipY {
		0% {
			transform: rotateY(0deg);
		}
		50% {
			transform: rotateY(90deg);
		}
		100% {
			transform: rotateY(180deg);
		}
	}
</style>
