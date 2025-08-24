<script lang="ts">
	import { fx, type FxItem } from '$lib/stores/fx';
	import { onMount, tick } from 'svelte';

	export let it: FxItem;

	// animation state
	let run = false; // spawn -> travel
	let fade = false; // fade out at the end
	let killTimer: ReturnType<typeof setTimeout>;

	// helpers
	function centerOf(r: DOMRect) {
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	// “safe” in-flight card size (keeps aspect & avoids cropping)
	const CARD_MIN = 120;
	const CARD_MAX = 320;
	const aspect = 430 / 670; // width/height

	const cardH = Math.min(
		CARD_MAX,
		Math.max(CARD_MIN, 0.26 * Math.min(window.innerWidth, window.innerHeight))
	);
	const cardW = cardH * aspect;

	// start / target (centers)
	const s = centerOf(it.fromRect);
	let t = centerOf(it.targetRect);

	// ↓↓↓ adjust destination when opponent is at the top and we’re dealing damage
	// (makes the impact point lower on the screen to be easier to see)
	if (it.kind === 'damage') {
		const nearTop = t.y < window.innerHeight * 0.35; // “opponent-ish”
		if (nearTop) {
			t = { x: t.x, y: t.y + window.innerHeight * 0.4 };
		}
	}
	// (optional idea)
	// if (it.kind === 'heal' && t.y > window.innerHeight * 0.65) {
	//   t = { x: t.x, y: t.y - window.innerHeight * 0.08 }; // lift a bit when healing self
	// }

	// small random rotation for life
	const rotStart = (Math.random() * 16 - 8).toFixed(1);
	const rotEnd = (Math.random() * 10 - 5).toFixed(1);

	// timings
	const spawnMs = 120;
	const travelMs = Math.max(360, (it.duration ?? 900) - 260);
	const fadeMs = 200;

	onMount(async () => {
		await tick();
		requestAnimationFrame(() => (run = true));

		// schedule fade + removal
		const endAt = spawnMs + travelMs;
		killTimer = setTimeout(() => {
			fade = true;
			setTimeout(() => fx.finish(it.id), fadeMs);
		}, endAt);

		// failsafe in case anything stalls
		setTimeout(() => fx.finish(it.id), (it.duration ?? 900) + 800);

		return () => clearTimeout(killTimer);
	});
</script>

<div
	class="fx-item {run ? 'run' : ''} {fade ? 'fade' : ''} {it.kind}"
	style="
    --sx:{s.x}px; --sy:{s.y}px;
    --tx:{t.x}px; --ty:{t.y}px;
    --cw:{cardW}px; --ch:{cardH}px;
    --rotStart:{rotStart}deg; --rotEnd:{rotEnd}deg;
    --spawnMs:{spawnMs}ms; --travelMs:{travelMs}ms; --fadeMs:{fadeMs}ms;
  "
>
	<div class="card">
		<img class="art" src={it.imgUrl} alt="" />
		{#if it.frameUrl}
			<img class="frame" src={it.frameUrl} alt="" />
		{/if}
	</div>

	<div class="pop">
		{it.kind === 'heal' ? `+${it.amount}` : `-${it.amount}`}
	</div>
</div>

<style>
	.fx-item {
		position: fixed;
		left: 0;
		top: 0;

		/* initial position + size */
		transform: translate(calc(var(--sx) - var(--cw) / 2), calc(var(--sy) - var(--ch) / 2))
			rotate(var(--rotStart)) scale(0.72);
		width: var(--cw);
		height: var(--ch);
		opacity: 0;

		transition:
			transform var(--spawnMs) ease,
			opacity var(--spawnMs) ease;
		pointer-events: none;
	}
	.fx-item.run {
		/* travel to target */
		transform: translate(calc(var(--tx) - var(--cw) / 2), calc(var(--ty) - var(--ch) / 2))
			rotate(var(--rotEnd)) scale(1);
		opacity: 1;
		transition:
			transform var(--travelMs) cubic-bezier(0.22, 0.86, 0.42, 1),
			opacity var(--travelMs) linear;
	}
	.fx-item.fade {
		opacity: 0;
		transition: opacity var(--fadeMs) ease;
	}

	.card {
		position: absolute;
		inset: 0;
		border-radius: 10px;
		filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.45));
	}
	.art,
	.frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain; /* keep full card, no side cropping */
		border-radius: 10px;
		display: block;
	}
	.frame {
		pointer-events: none;
	}

	.pop {
		position: absolute;
		left: 50%;
		top: -12px;
		transform: translate(-50%, 0) scale(0.7);
		font:
			800 22px/1.1 system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
		opacity: 0;
		transition:
			transform 220ms ease,
			opacity 220ms ease;
	}
	.fx-item.run .pop {
		opacity: 1;
		transform: translate(-50%, -14px) scale(1);
	}
	.fx-item.damage .pop {
		color: #ffd0d0;
	}
	.fx-item.heal .pop {
		color: #b9f4c8;
	}
</style>
