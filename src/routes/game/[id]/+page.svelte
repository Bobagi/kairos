<!-- src/routes/game/[id]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import GameStage from '$lib/components/GameStage.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	/** UI error message (network or server errors) */
	let errorMessage: string | null = null;

	/** Result when the game already ended (winner or tie) */
	let finalResult: { winner: string | null; log: string[] } | null = null;

	/** Game id from URL (reactive) */
	$: gameId = $page.params.id;

	/** Derive player ids (reactive based on store) */
	$: playerIdA = $game?.players?.[0] ?? 'playerA';
	$: playerIdB = $game?.players?.[1] ?? 'playerB';

	/** Visual cap for HP bars */
	const MAX_HP = 20;

	/** Map a card code to the CDN filename (supports legacy + new codes) */
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

	/** Load state; if not found (null), fetch final result to show outcome */
	async function loadStateOrResult() {
		errorMessage = null;
		finalResult = null;

		try {
			const state = (await getGameState(gameId)) as GameState | null;
			if (state && typeof state === 'object') {
				game.set(state);
				return;
			}

			// No in-memory state: try final summary
			const result = await getGameResult(gameId);
			finalResult = result;
			game.set(null);
		} catch (err) {
			console.error(err);
			errorMessage = 'Could not load game state';
			game.set(null);
		}
	}

	/** Try to play a card, then reload */
	async function onPlayCard(cardCode: string) {
		try {
			await playCard(gameId, playerIdA, cardCode);
		} catch (err) {
			console.error('Play card failed', err);
		}
		await loadStateOrResult();
	}

	/** Try to skip turn, then reload */
	async function onSkipTurn() {
		try {
			await skipTurn(gameId, playerIdA);
		} catch (err) {
			console.error('Skip turn failed', err);
		}
		await loadStateOrResult();
	}

	onMount(loadStateOrResult);

	/** Safe accessors for HP and hands even while loading */
	$: hpA = $game?.hp?.[playerIdA] ?? 0;
	$: hpB = $game?.hp?.[playerIdB] ?? 0;
	$: handA = Array.isArray($game?.hands?.[playerIdA]) ? $game!.hands[playerIdA] : [];
</script>

<div class="flex flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold">Game {gameId}</h1>

	{#if errorMessage}
		<p class="text-red-600">{errorMessage}</p>
	{:else if finalResult}
		<!-- Finished game (either win or tie) -->
		<section class="space-y-2">
			<h2 class="text-xl font-semibold">Game finished</h2>
			{#if finalResult.winner === null}
				<p class="text-amber-600">Tie game — no winner.</p>
			{:else}
				<p class="text-green-600">Winner: {finalResult.winner}</p>
			{/if}
			{#if Array.isArray(finalResult.log)}
				<div class="mt-2 max-h-64 overflow-auto rounded border p-2 text-sm">
					{#each finalResult.log as line, i}
						<div>{i + 1}. {line}</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if !$game}
		<p>Loading game…</p>
	{:else}
		<!-- HP bars -->
		<section class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="font-medium">{playerIdA}: {hpA} HP</span>
				<span class="font-medium">{playerIdB}: {hpB} HP</span>
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

		<!-- Pixi board -->
		<GameStage />

		<!-- Player A hand (clickable) -->
		<section>
			<h2 class="mt-4 text-xl font-semibold">Your Hand ({playerIdA})</h2>

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

		<!-- Lightweight log to help visualize flow -->
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
