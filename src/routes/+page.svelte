<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	// type‐only import
	import type { GameSummary } from '$lib/api/GameClient';
	import {
		endGameOnServer,
		expireGames,
		health,
		listActive,
		listActiveRaw,
		startGame
	} from '$lib/api/GameClient';

	let player = 'alice';
	let msg = 'Checking API…';
	let activeGames: GameSummary[] = [];

	// load health + active games
	async function loadAll() {
		try {
			msg = await health();
		} catch (e) {
			msg = (e as Error).message;
		}

		try {
			// inspect raw data in console
			const raw = await listActiveRaw();
			console.log('👀 Raw active games list:', raw);

			// then map to our summaries
			activeGames = await listActive();
			console.log('✅ Mapped activeGames:', activeGames);
		} catch (e) {
			console.error('Could not load active games', e);
			activeGames = [];
		}
	}

	onMount(loadAll);

	async function newGame() {
		try {
			await startGame(player);
		} catch (e) {
			console.error(e);
			msg = 'Failed to start game';
		}
		await loadAll();
	}

	async function expireAndRefresh() {
		try {
			await expireGames();
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	function goToGame(id: string) {
		goto(`/game/${id}`);
	}

	async function endGame(id: string) {
		try {
			await endGameOnServer(id);
		} catch (e) {
			console.error('Could not end game on server', e);
		}
		await loadAll();
	}
</script>

<div class="mx-auto flex max-w-xl flex-col gap-6 p-4">
	<h1 class="text-center text-3xl font-bold">Kairos – Chronos Card Game</h1>

	<p class="text-center text-sm text-gray-500">
		Backend health: <span class="font-mono">{msg}</span>
	</p>

	<div class="flex items-center justify-center gap-2">
		<label class="flex items-center gap-2">
			<span>Player ID:</span>
			<input bind:value={player} class="rounded border p-1" />
		</label>
		<button class="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700" on:click={newGame}>
			Start game
		</button>
	</div>

	<div class="flex justify-end">
		<button class="text-sm text-red-500 underline hover:text-red-700" on:click={expireAndRefresh}>
			Expire old games
		</button>
	</div>

	<section>
		<h2 class="mb-2 text-xl font-semibold">Active Games</h2>
		{#if activeGames.length > 0}
			<ul class="space-y-3">
				{#each activeGames as game}
					<li class="flex items-center justify-between rounded border p-3">
						<div>
							<p class="font-mono text-sm text-gray-800">{game.id}</p>
							<p class="text-xs text-gray-500">
								Player A: {game.playerAId}
							</p>
						</div>
						<div class="flex gap-2">
							<button
								class="rounded bg-gray-700 px-3 py-1 text-white hover:bg-gray-800"
								on:click={() => goToGame(game.id)}
							>
								Go to game
							</button>
							<button
								class="rounded border px-3 py-1 text-red-600 hover:bg-red-50"
								on:click={() => endGame(game.id)}
							>
								End game
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-gray-500">No active games.</p>
		{/if}
	</section>
</div>
