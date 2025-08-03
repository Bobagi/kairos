<script lang="ts">
	import { Application, Graphics } from 'pixi.js';
	import { onDestroy, onMount, tick } from 'svelte';

	let canvasEl: HTMLCanvasElement;
	let app: Application | null = null;

	onMount(async () => {
		await tick();
		if (!canvasEl) return;

		app = new Application({
			view: canvasEl,
			width: canvasEl.clientWidth,
			height: canvasEl.clientHeight,
			backgroundColor: 0x27272a,
			antialias: true
		});

		const g = new Graphics().beginFill(0xff0000).drawRect(10, 10, 80, 50).endFill();
		app.stage.addChild(g);
	});

	onDestroy(() => {
		// wrap in try/catch so destroy never bubbles
		try {
			if (app) {
				app.destroy(true, { children: true, texture: false, baseTexture: false });
				app = null;
			}
		} catch (e) {
			// swallow any errors
			console.warn('GameStage cleanup error (ignored):', e);
		}
	});
</script>

<canvas bind:this={canvasEl} class="block h-64 w-full" style="background-color: #27272a;"></canvas>
