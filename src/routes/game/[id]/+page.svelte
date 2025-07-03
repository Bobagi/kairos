<script lang="ts">
	import { page } from '$app/stores';
	import { getGameState } from '$lib/api/GameClient';
	import GameStage from '$lib/components/GameStage.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	// error message (if loading fails)
	let error: string | null = null;

	// grab `id` from URL
	$: gameId = $page.params.id;

	// derive current player as the first in the array
	$: currentPlayer = $game?.players?.[0] ?? 'unknown';

	// on mount, fetch real game state
	onMount(async () => {
		if (!gameId) {
			error = 'Missing game ID in URL';
			return;
		}
		try {
			const state = (await getGameState(gameId)) as GameState;
			console.log('🔍 full game state:', state);
			game.set(state);
		} catch (e) {
			console.error(e);
			error = 'Could not load game state';
		}
	});
</script>

<div class="flex flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold">Game {gameId}</h1>

	{#if error}
		<p class="text-red-600">{error}</p>
	{:else if !$game}
		<p>Loading game…</p>
	{:else}
		<!-- PixiJS canvas stub -->
		<GameStage />

		<!-- Dynamic “Your Hand” for whichever player is first -->
		<section>
			<h2 class="text-xl font-semibold">Your Hand ({currentPlayer})</h2>

			{#if Array.isArray($game.hands[currentPlayer]) && $game.hands[currentPlayer].length > 0}
				<div class="grid grid-cols-3 gap-4">
					{#each $game.hands[currentPlayer] as cardCode}
						<div class="flex flex-col items-center">
							<img
								src={`https://bobagi.click/images/cards/${cardCode}.png`}
								alt={cardCode}
								class="w-full rounded shadow transition-transform hover:scale-105"
							/>
							<span class="mt-1 text-sm">{cardCode}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No cards in hand</p>
			{/if}
		</section>
	{/if}
</div>
