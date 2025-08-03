<script lang="ts">
	import { page } from '$app/stores';
	import { getGameState, playCard } from '$lib/api/GameClient';
	import GameStage from '$lib/components/GameStage.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	/** Error message if loading fails */
	let error: string | null = null;

	/** The game ID from the URL */
	$: gameId = $page.params.id;

	/** Derive the current player (first in the `players` array) */
	$: currentPlayer = $game?.players?.[0] ?? 'unknown';
	/** The opponent is the second player */
	$: opponent = $game?.players?.[1] ?? 'unknown';

	/** Map the code names from the backend to your CDN filenames */
	const imageMap: Record<string, string> = {
		fireball: 'flamed-leaf.png',
		heal: 'remedy.png',
		lightning: 'power-lightning.png'
	};

	/** Build the full URL for a card’s image */
	function cardUrl(code: string): string {
		const filename = imageMap[code] ?? `${code}.png`;
		return `https://bobagi.click/images/cards/${filename}`;
	}

	/** Fetch the game state and populate the store */
	async function loadGame() {
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
	}

	/** Play a card: send to backend, then reload the state */
	async function play(code: string) {
		try {
			await playCard(gameId, currentPlayer, code);
			await loadGame();
		} catch (e) {
			console.error('Play card failed', e);
		}
	}

	// On component mount, load the game
	onMount(loadGame);

	/** Maximum HP for scaling the bars */
	const MAX_HP = 20;
</script>

<div class="flex flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold">Game {gameId}</h1>

	{#if error}
		<p class="text-red-600">{error}</p>
	{:else if !$game}
		<p>Loading game…</p>
	{:else}
		<!-- ⬇️ Health bars for each player -->
		<section class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="font-medium">{currentPlayer}: {$game.hp[currentPlayer]} HP</span>
				<span class="font-medium">{opponent}: {$game.hp[opponent]} HP</span>
			</div>
			<div class="flex gap-2">
				<!-- Player bar -->
				<div class="h-3 flex-1 overflow-hidden rounded bg-gray-700">
					<div
						class="h-full bg-green-500"
						style="width: {($game.hp[currentPlayer] / MAX_HP) * 100}%"
					></div>
				</div>
				<!-- Opponent bar -->
				<div class="h-3 flex-1 overflow-hidden rounded bg-gray-700">
					<div
						class="h-full bg-red-500"
						style="width: {($game.hp[opponent] / MAX_HP) * 100}%"
					></div>
				</div>
			</div>
		</section>

		<!-- ⬇️ The PixiJS board -->
		<GameStage />

		<!-- ⬇️ The player's hand as clickable cards -->
		<section>
			<h2 class="mt-4 text-xl font-semibold">Your Hand ({currentPlayer})</h2>
			{#if Array.isArray($game.hands[currentPlayer]) && $game.hands[currentPlayer].length > 0}
				<div class="mt-2 grid grid-cols-3 gap-4">
					{#each $game.hands[currentPlayer] as code}
						<button
							type="button"
							class="flex flex-col items-center focus:outline-none"
							on:click={() => play(code)}
						>
							<img
								src={cardUrl(code)}
								alt={code}
								class="w-full rounded shadow transition-transform hover:scale-105"
							/>
							<span class="mt-1 text-sm">{code}</span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No cards in hand</p>
			{/if}
		</section>
	{/if}
</div>
