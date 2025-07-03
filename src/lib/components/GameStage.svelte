<!-- src/lib/components/GameStage.svelte -->
<script lang="ts">
	import { Application, Graphics } from 'pixi.js';
	import { onDestroy, onMount } from 'svelte';

	// bind to this <canvas>
	let canvasEl: HTMLCanvasElement;
	let app: Application;

	onMount(() => {
		if (!canvasEl) {
			console.error('GameStage: canvas element not found!');
			return;
		}

		// create the PIXI app, telling it to use our canvas
		app = new Application({
			view: canvasEl,
			width: canvasEl.clientWidth,
			height: canvasEl.clientHeight,
			backgroundColor: 0x27272a,
			antialias: true
		});

		// draw a quick red rectangle so we know it worked
		const gfx = new Graphics().beginFill(0xff0000).drawRect(10, 10, 80, 50).endFill();

		app.stage.addChild(gfx);
	});

	onDestroy(() => {
		app?.destroy(true);
	});
</script>

<canvas bind:this={canvasEl} class="block h-64 w-full" style="background-color: #27272a;"></canvas>
