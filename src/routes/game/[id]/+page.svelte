<script lang="ts">
	import { page } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import GameStage from '$lib/components/GameStage.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	let errorMessage: string | null = null;
	let finalResult: { winner: string | null; log: string[] } | null = null;

	$: gameId = $page.params.id;
	$: playerIdA = $game?.players?.[0] ?? 'playerA';
	$: playerIdB = $game?.players?.[1] ?? 'playerB';

	const MAX_HP = 20;

	function filenameForCard(code: string): string {
		if (code.includes('-')) return `${code}.png`;
		switch (code) {
			case 'fireball':
				return 'flamed-leaf.png';
			case 'heal':
				return 'remedy.png';
			case 'lightning':
				return 'power-lightning.png';
			default:
				return `${code}.png`;
		}
	}
	function imageUrlForCard(code: string): string {
		return `https://bobagi.click/images/cards/${filenameForCard(code)}`;
	}

	async function loadStateOrResult() {
		errorMessage = null;
		finalResult = null;
		try {
			const state = (await getGameState(gameId)) as GameState | null;
			if (state && typeof state === 'object') {
				game.set(state);
				return;
			}
			const result = await getGameResult(gameId);
			finalResult = result;
			game.set(null);
		} catch {
			errorMessage = 'Could not load game state';
			game.set(null);
		}
	}

	async function onPlayCard(cardCode: string) {
		try {
			await playCard(gameId, playerIdA, cardCode);
		} catch {}
		await loadStateOrResult();
	}

	async function onSkipTurn() {
		try {
			await skipTurn(gameId, playerIdA);
		} catch {}
		await loadStateOrResult();
	}

	onMount(loadStateOrResult);

	$: hpA = $game?.hp?.[playerIdA] ?? 0;
	$: hpB = $game?.hp?.[playerIdB] ?? 0;
	$: handA = Array.isArray($game?.hands?.[playerIdA]) ? $game!.hands[playerIdA] : [];
	$: deckCountA = Array.isArray($game?.decks?.[playerIdA]) ? $game!.decks[playerIdA].length : 0;
	$: deckCountB = Array.isArray($game?.decks?.[playerIdB]) ? $game!.decks[playerIdB].length : 0;
	$: endedDueToNoCards =
		Array.isArray(finalResult?.log) && finalResult!.log.some((l) => /no cards/i.test(l));
</script>

<div class="flex flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold">Game {gameId}</h1>

	{#if errorMessage}
		<section class="max-w-xl rounded border p-4">
			<h2 class="text-xl font-semibold">Game unavailable</h2>
			<p class="mt-1 text-gray-700">
				This match has already finished or the state is no longer in memory.
			</p>
			<div class="mt-3 flex gap-3">
				<a href="/" class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					>Back to home</a
				>
				<button
					type="button"
					class="rounded border px-4 py-2 hover:bg-gray-100"
					on:click={loadStateOrResult}>Try again</button
				>
			</div>
		</section>
	{:else if finalResult}
		<section class="max-w-2xl space-y-3">
			<h2 class="text-xl font-semibold">Game finished</h2>
			{#if finalResult.winner === null}
				<p class="text-amber-700">Tie game.</p>
				{#if endedDueToNoCards}
					<p class="text-gray-700">Both players ran out of cards.</p>
				{/if}
			{:else}
				<p class="text-green-700">Winner: {finalResult.winner}</p>
			{/if}
			{#if Array.isArray(finalResult.log)}
				<div class="mt-1 max-h-64 overflow-auto rounded border p-2 text-sm">
					{#each finalResult.log as line, i}
						<div>{i + 1}. {line}</div>
					{/each}
				</div>
			{/if}
			<div class="pt-2">
				<a href="/" class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					>Back to home</a
				>
			</div>
		</section>
	{:else if !$game}
		<p>Loading game…</p>
	{:else}
		<section class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="font-medium">{playerIdA}: {hpA} HP • Deck {deckCountA}</span>
				<span class="font-medium">{playerIdB}: {hpB} HP • Deck {deckCountB}</span>
			</div>
			<div class="flex gap-2">
				<div class="h-3 flex-1 overflow-hidden rounded bg-gray-700">
					<div
						class="h-full bg-green-500"
						style="width: {Math.max(0, Math.min(100, (hpA / MAX_HP) * 100))}%"
					/>
				</div>
				<div class="h-3 flex-1 overflow-hidden rounded bg-gray-700">
					<div
						class="h-full bg-red-500"
						style="width: {Math.max(0, Math.min(100, (hpB / MAX_HP) * 100))}%"
					/>
				</div>
			</div>
		</section>

		<GameStage />

		<section>
			<h2 class="mt-4 text-xl font-semibold">Your Hand ({playerIdA}) • Deck {deckCountA}</h2>

			{#if handA.length > 0}
				<div class="mt-2 grid grid-cols-3 gap-4">
					{#each handA as code}
						<button
							type="button"
							class="flex flex-col items-center focus:outline-none"
							title={`Play ${code}`}
							on:click={() => onPlayCard(code)}
						>
							<img
								src={imageUrlForCard(code)}
								alt={code}
								class="w-full rounded shadow transition-transform hover:scale-105"
								loading="eager"
								decoding="sync"
							/>
							<span class="mt-1 text-sm">{code}</span>
						</button>
					{/each}
				</div>
			{:else}
				<div class="mt-2 flex items-center gap-3">
					<p class="text-gray-500">No cards in hand</p>
					<button
						type="button"
						class="rounded bg-amber-600 px-3 py-2 text-white hover:bg-amber-700"
						on:click={onSkipTurn}
					>
						Skip turn
					</button>
				</div>
			{/if}
		</section>

		{#if Array.isArray($game.log)}
			<section class="mt-2">
				<h3 class="font-semibold">Log</h3>
				<ul class="mt-1 max-h-48 space-y-1 overflow-auto rounded border p-2 text-sm">
					{#each $game.log as line, i}
						<li class="text-gray-700">{i + 1}. {line}</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
