<script lang="ts">
    import { onMount } from 'svelte';
    import { health, startGame } from '$lib/api/GameClient';
    import { game } from '$lib/stores/game';
    import { goto } from '$app/navigation';
  
    let player = 'alice';
    let msg = 'Checking API…';
  
    onMount(async () => {
      try {
        msg = await health();
      } catch (e) {
        msg = (e as Error).message;
      }
    });
  
    async function newGame() {
      try {
        const { gameId } = await startGame(player);
        game.set({ id: gameId, status: 'running' });
        // aqui que a gente navega pra /game/<gameId>
        goto(`/game/${gameId}`);
      } catch (err) {
        console.error(err);
        msg = 'Failed to start game';
      }
    }
  </script>
  
  <div class="min-h-screen flex flex-col items-center justify-center gap-6">
    <h1 class="text-3xl font-bold">Kairos – Chronos Card Game</h1>
  
    <p class="text-sm text-gray-500">
      Backend health: <span class="font-mono">{msg}</span>
    </p>
  
    <label class="flex items-center gap-2">
      <span>Player&nbsp;ID:</span>
      <input id="player" bind:value={player} class="border p-1 rounded" />
    </label>
  
    <button
      on:click={newGame}
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
    >
      Start game
    </button>
  </div>
  