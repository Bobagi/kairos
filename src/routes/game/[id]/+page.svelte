<script lang="ts">
    import GameStage from '$lib/components/GameStage.svelte';
    import { page } from '$app/stores';
  
    $: gameId = $page.params.id;
  </script>
  
  <h2 class="text-xl text-center my-4">Game {gameId}</h2>
  <GameStage />
  