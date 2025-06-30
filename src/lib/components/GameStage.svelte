<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as PIXI from 'pixi.js';
  
    export let width = 1024;
    export let height = 600;
  
    let host: HTMLDivElement;
    let app: PIXI.Application;
  
    onMount(() => {
      app = new PIXI.Application({ width, height, background: 0x27272a });
      host.appendChild(app.view);
      // TODO: desenhar cartas assim que gameStore tiver dados
    });
  
    onDestroy(() => app?.destroy(true));
  </script>
  
  <div bind:this={host} class="mx-auto border-2 border-gray-700"></div>
  