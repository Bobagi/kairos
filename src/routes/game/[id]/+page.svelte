<script lang="ts">
	import { page } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	let frameOverlayUrl: string | null = '/frames/default.png';
	const titleOverlayUrl = '/frames/title.png';
	const cardBackImageUrl = '/frames/card-back.png';

	let errorMessage: string | null = null;
	let finalResult: { winner: string | null; log: string[] } | null = null;

	$: gameId = $page.params.id;

	const MAX_HP = 20;
	const cardWidthCss = 'clamp(110px, 22vw, 220px)';

	type HandItem = { code: string; uid: string };
	let handItems: HandItem[] = [];
	const pendingReveal = new Set<string>();
	let flipCycle = 0;

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

	function makeUid() {
		return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	}

	// Reconciliador: transforma array de códigos do backend em itens {code, uid}
	// Reusa uids existentes quando possível; cria novos uids para ocorrências novas (essas já nascem flipando).
	function reconcileHand(
		prev: HandItem[],
		codes: string[]
	): { items: HandItem[]; created: string[] } {
		const oldCodes = prev.map((it) => it.code);
		const newCodes = codes;

		const n = oldCodes.length;
		const m = newCodes.length;

		const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
		for (let i = n - 1; i >= 0; i--) {
			for (let j = m - 1; j >= 0; j--) {
				dp[i][j] =
					oldCodes[i] === newCodes[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
			}
		}

		const matchedOldToNew = new Map<number, number>();
		let i = 0,
			j = 0;
		while (i < n && j < m) {
			if (oldCodes[i] === newCodes[j]) {
				matchedOldToNew.set(i, j);
				i++;
				j++;
			} else if (dp[i + 1][j] >= dp[i][j + 1]) {
				i++;
			} else {
				j++;
			}
		}

		const usedOld = new Set<number>();
		const created: string[] = [];
		const items: HandItem[] = [];

		for (let newIdx = 0; newIdx < m; newIdx++) {
			let reused = false;
			for (const [oldIdx, mappedNewIdx] of matchedOldToNew) {
				if (mappedNewIdx === newIdx && !usedOld.has(oldIdx)) {
					items.push(prev[oldIdx]);
					usedOld.add(oldIdx);
					reused = true;
					break;
				}
			}
			if (!reused) {
				const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
				items.push({ code: newCodes[newIdx], uid });
				created.push(uid);
			}
		}

		return { items, created };
	}

	async function loadTemplatesOnce() {
		try {
			const res = await fetch('/game/templates');
			const templates = (await res.json()) as Array<{ frameUrl?: string }>;
			const remote =
				Array.isArray(templates) && templates[0]?.frameUrl ? templates[0].frameUrl : null;
			if (remote) frameOverlayUrl = remote;
		} catch {}
	}

	async function loadStateOrResult() {
		errorMessage = null;
		finalResult = null;
		try {
			const state = (await getGameState(gameId)) as GameState | null;
			if (state && typeof state === 'object') {
				game.set(state);

				const aId = state.players[0];
				const codes = Array.isArray(state.hands?.[aId]) ? (state.hands[aId] as string[]) : [];

				const { items, created } = reconcileHand(handItems, codes);
				handItems = items;
				if (created.length) {
					for (const uid of created) pendingReveal.add(uid);
					flipCycle++;
				}
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
		const aId = $game?.players?.[0] ?? 'playerA';
		try {
			await playCard(gameId, aId, cardCode);
		} catch {}
		await loadStateOrResult();
	}

	async function onSkipTurn() {
		const aId = $game?.players?.[0] ?? 'playerA';
		try {
			await skipTurn(gameId, aId);
		} catch {}
		await loadStateOrResult();
	}

	onMount(async () => {
		await loadTemplatesOnce();
		await loadStateOrResult();
	});

	$: playerIdA = $game?.players?.[0] ?? 'playerA';
	$: playerIdB = $game?.players?.[1] ?? 'playerB';
	$: hpA = $game?.hp?.[playerIdA] ?? 0;
	$: hpB = $game?.hp?.[playerIdB] ?? 0;
	$: deckCountA = Array.isArray($game?.decks?.[playerIdA]) ? $game!.decks[playerIdA].length : 0;
	$: deckCountB = Array.isArray($game?.decks?.[playerIdB]) ? $game!.decks[playerIdB].length : 0;
	$: endedDueToNoCards =
		Array.isArray(finalResult?.log) && finalResult!.log.some((l) => /no cards/i.test(l));

	function handleFlipEnd(uid: string) {
		pendingReveal.delete(uid);
	}
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
				{#if endedDueToNoCards}<p class="text-gray-700">Both players ran out of cards.</p>{/if}
			{:else}
				<p class="text-green-700">Winner: {finalResult.winner}</p>
			{/if}
			{#if Array.isArray(finalResult.log)}
				<div class="mt-1 max-h-64 overflow-auto rounded border p-2 text-sm">
					{#each finalResult.log as line, i}<div>{i + 1}. {line}</div>{/each}
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
						style="width:{Math.max(0, Math.min(100, (hpA / MAX_HP) * 100))}%"
					/>
				</div>
				<div class="h-3 flex-1 overflow-hidden rounded bg-gray-700">
					<div
						class="h-full bg-red-500"
						style="width:{Math.max(0, Math.min(100, (hpB / MAX_HP) * 100))}%"
					/>
				</div>
			</div>
		</section>

		<section class="mt-2 flex items-end justify-between">
			<div class="flex items-center gap-3">
				<DeckStack
					deckCount={deckCountA}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					rotateStepDeg={0.8}
				/>
				<div class="text-sm text-gray-700">Deck {deckCountA}</div>
			</div>
			<div class="text-sm text-gray-700">Opponent Deck {deckCountB}</div>
		</section>

		<section>
			<h2 class="mt-4 text-xl font-semibold">Your Hand ({playerIdA}) • Deck {deckCountA}</h2>

			{#if handItems.length > 0}
				<div class="mt-2 flex flex-wrap gap-4">
					{#each handItems as it (it.uid)}
						{#key it.uid}
							<button
								type="button"
								class="flex shrink-0 flex-col items-center focus:outline-none"
								style={`width:${cardWidthCss}`}
								title={`Play ${it.code}`}
								on:click={() => onPlayCard(it.code)}
							>
								<div class="flip-wrap" data-cycle={flipCycle}>
									<div
										class="flipper"
										class:animate={pendingReveal.has(it.uid)}
										on:animationend={() => handleFlipEnd(it.uid)}
										style="--flip-ms:700ms;"
									>
										<div class="face front">
											<CardComposite
												artImageUrl={imageUrlForCard(it.code)}
												frameImageUrl={frameOverlayUrl ?? '/frames/default.png'}
												titleImageUrl={titleOverlayUrl}
												titleText={it.code}
												aspectWidth={430}
												aspectHeight={670}
												artObjectFit="cover"
												enableTilt={true}
											/>
										</div>
										<div class="face back">
											<img
												src={cardBackImageUrl}
												alt="card-back"
												style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;"
												loading="eager"
												decoding="sync"
												draggable="false"
											/>
										</div>
									</div>
								</div>
								<span class="mt-1 w-full truncate text-center text-sm">{it.code}</span>
							</button>
						{/key}
					{/each}
				</div>
			{:else}
				<div class="mt-2 flex items-center gap-3">
					<p class="text-gray-500">No cards in hand</p>
					<button
						type="button"
						class="rounded bg-amber-600 px-3 py-2 text-white hover:bg-amber-700"
						on:click={onSkipTurn}>Skip turn</button
					>
				</div>
			{/if}
		</section>

		{#if Array.isArray($game.log)}
			<section class="mt-2">
				<h3 class="font-semibold">Log</h3>
				<ul class="mt-1 max-h-48 space-y-1 overflow-auto rounded border p-2 text-sm">
					{#each $game.log as line, i}<li class="text-gray-700">{i + 1}. {line}</li>{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<style>
	.flip-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 430/670;
		perspective: 1000px;
	}
	.flipper {
		position: absolute;
		inset: 0;
		transform-style: preserve-3d;
		border-radius: 8px;
		overflow: visible;
	}
	.face {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
	}
	.front {
		transform: rotateY(0deg);
		z-index: 2;
	}
	.back {
		transform: rotateY(180deg);
		z-index: 1;
	}
	.animate {
		animation: flipReveal var(--flip-ms, 700ms) ease forwards;
	}
	@keyframes flipReveal {
		0% {
			transform: rotateY(180deg);
		}
		50% {
			transform: rotateY(90deg);
		}
		100% {
			transform: rotateY(0deg);
		}
	}
</style>
