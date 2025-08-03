<script lang="ts">
	import { page } from '$app/stores';
	import { getGameState } from '$lib/api/GameClient';
	import GameStage from '$lib/components/GameStage.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	// Error message if loading fails
	let error: string | null = null;

	// The game ID from the URL
	$: gameId = $page.params.id;

	// Derive the “current player” as the first in the players array
	$: currentPlayer = $game?.players?.[0] ?? 'unknown';

	// Map backend card codes to the actual CDN filenames
	const imageMap: Record<string, string> = {
		fireball: 'flamed-leaf.png',
		heal: 'remedy.png',
		lightning: 'power-lightning.png'
	};

	// Build the full image URL for a given card code
	function cardUrl(code: string): string {
		const filename = imageMap[code] ?? `${code}.png`;
		return `https://bobagi.click/images/cards/${filename}`;
	}

	// On component mount, fetch the full game state and populate the store
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
		<!-- PixiJS canvas for the board -->
		<GameStage />

		<!-- Render the current player's hand -->
		<section>
			<h2 class="text-xl font-semibold">Your Hand ({currentPlayer})</h2>

			{#if Array.isArray($game.hands[currentPlayer]) && $game.hands[currentPlayer].length > 0}
				<div class="grid grid-cols-3 gap-4">
					{#each $game.hands[currentPlayer] as code}
						<div class="flex flex-col items-center">
							<img
								src={cardUrl(code)}
								alt={code}
								class="w-full rounded shadow transition-transform hover:scale-105"
							/>
							<span class="mt-1 text-sm">{code}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No cards in hand</p>
			{/if}
		</section>
	{/if}
</div>
