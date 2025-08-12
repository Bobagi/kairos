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
	const cardWidthCss = 'clamp(104px, 17.5vw, 200px)';

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

	function reconcileHand(
		prev: HandItem[],
		codes: string[]
	): { items: HandItem[]; created: string[] } {
		const old = prev.map((p) => p.code),
			nw = codes;
		const n = old.length,
			m = nw.length,
			dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
		for (let i = n - 1; i >= 0; i--)
			for (let j = m - 1; j >= 0; j--)
				dp[i][j] = old[i] === nw[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
		const map = new Map<number, number>();
		let i = 0,
			j = 0;
		while (i < n && j < m) {
			if (old[i] === nw[j]) {
				map.set(i, j);
				i++;
				j++;
			} else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
			else j++;
		}
		const used = new Set<number>();
		const created: string[] = [];
		const items: HandItem[] = [];
		for (let nj = 0; nj < m; nj++) {
			let reused = false;
			for (const [oi, mj] of map) {
				if (mj === nj && !used.has(oi)) {
					items.push(prev[oi]);
					used.add(oi);
					reused = true;
					break;
				}
			}
			if (!reused) {
				const uid = makeUid();
				items.push({ code: nw[nj], uid });
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
		try {
			const state = (await getGameState(gameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalResult = null;
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
		} catch {
			/* fallthrough to result */
		}
		try {
			const result = await getGameResult(gameId);
			finalResult = result;
		} catch {
			errorMessage = 'Could not load game state';
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
	$: oppHandCount = Array.isArray($game?.hands?.[playerIdB]) ? $game!.hands[playerIdB].length : 0;
	$: endedDueToNoCards =
		Array.isArray(finalResult?.log) && finalResult!.log.some((l) => /no cards/i.test(l));

	function handleFlipEnd(uid: string) {
		pendingReveal.delete(uid);
	}
</script>

<div class="board">
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerIdB}</span>
			<span class="pill hp">❤️ {hpB}</span>
			<span class="pill deck">🃏 {deckCountB}</span>
		</div>
		<div class="zone-row">
			<div class="hand opp-hand">
				{#each Array.from({ length: oppHandCount }) as _, i}
					<div class="card-socket" style={`width:${cardWidthCss}`}>
						<div class="card-back-wrap" title="Opponent card">
							<img
								src="/frames/card-back.png"
								alt="card-back"
								style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;"
								loading="eager"
								decoding="sync"
								draggable="false"
							/>
						</div>
					</div>
				{/each}
			</div>
			<div class="deck-block">
				<DeckStack
					deckCount={deckCountB}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					rotateStepDeg={0.8}
				/>
			</div>
		</div>
	</section>

	<section class="zone center">
		<div class="status-pill">
			<div class="side">
				<span class="tag">👤</span><span class="who">{playerIdA}</span><span class="sep">•</span
				><span class="tag">❤️</span>
				{hpA}<span class="sep">•</span><span class="tag">🃏</span>
				{deckCountA}
			</div>
			<div class="vs">VS</div>
			<div class="side">
				<span class="tag">👤</span><span class="who">{playerIdB}</span><span class="sep">•</span
				><span class="tag">❤️</span>
				{hpB}<span class="sep">•</span><span class="tag">🃏</span>
				{deckCountB}
			</div>
		</div>

		<div class="center-right">
			{#if finalResult}
				<div class="notice success">
					<div class="title">Game finished</div>
					{#if finalResult.winner === null}
						<div class="msg">
							Tie game{endedDueToNoCards ? ' — both players ran out of cards' : ''}.
						</div>
					{:else}
						<div class="msg">Winner: {finalResult.winner}</div>
					{/if}
					<div class="actions">
						<a class="btn" href="/">Back to home</a>
						<button class="btn ghost" on:click={loadStateOrResult}>Refresh</button>
					</div>
				</div>
			{/if}

			{#if !finalResult && errorMessage}
				<div class="notice error">
					<div class="title">Network issue</div>
					<div class="msg">{errorMessage}</div>
					<button class="btn" on:click={loadStateOrResult}>Try again</button>
				</div>
			{/if}

			{#if handItems.length === 0 && !finalResult}
				<div class="notice warn">
					<div class="title">No cards in hand</div>
					<div class="msg">Draw or skip your turn.</div>
					<button class="btn" on:click={onSkipTurn}>Skip turn</button>
				</div>
			{/if}

			{#if Array.isArray($game?.log)}
				<div class="logbox">
					{#each $game.log.slice(-18) as line, i}
						<div class="logline">{$game.log.length - 18 + i + 1}. {line}</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerIdA}</span>
			<span class="pill hp">❤️ {hpA}</span>
			<span class="pill deck">🃏 {deckCountA}</span>
		</div>

		<div class="zone-row">
			<div class="deck-block left">
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
			</div>

			<div class="hand my-hand">
				{#each handItems as it (it.uid)}
					{#key it.uid}
						<button
							type="button"
							class="card-socket focus:outline-none"
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
											style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;"
											loading="eager"
											decoding="sync"
											draggable="false"
										/>
									</div>
								</div>
							</div>
						</button>
					{/key}
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	:global(body) {
		background: radial-gradient(ellipse at center, #0b2a2e 0%, #0a1d20 70%, #071418 100%);
	}

	.board {
		max-width: 1200px;
		margin: 16px auto;
		display: grid;
		grid-template-rows: auto auto auto;
		gap: 14px;
		padding: 10px;
	}
	.zone {
		border-radius: 12px;
		padding: 10px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
	}
	.zone.center {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		align-items: start;
		min-height: 220px;
	}
	.zone-header {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 2px 6px 8px;
		color: #d7e7ea;
		font-weight: 700;
	}
	.pill {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(255, 255, 255, 0.12);
		padding: 2px 8px;
		border-radius: 999px;
		font-weight: 600;
	}
	.pill.hp {
		color: #ffd4d4;
	}
	.pill.deck {
		color: #e7f2f3;
	}
	.name {
		font-size: clamp(13px, 2vw, 18px);
		margin-right: 6px;
	}
	.zone-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
		align-items: end;
	}
	.deck-block {
		width: clamp(84px, 10vw, 120px);
	}
	.deck-block.left {
		order: -1;
	}

	.hand {
		display: flex;
		flex-wrap: nowrap;
		gap: clamp(8px, 1.2vw, 14px);
		overflow-x: auto;
		padding: 4px 2px;
		scrollbar-width: thin;
	}
	.hand::-webkit-scrollbar {
		height: 8px;
	}
	.hand::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 8px;
	}
	.card-socket {
		position: relative;
		aspect-ratio: 430/670;
		border-radius: 10px;
	}
	.card-back-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 430/670;
		border-radius: 10px;
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
	}

	.status-pill {
		align-self: start;
		color: #e7f2f3;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 8px 12px;
		border-radius: 16px;
		display: flex;
		gap: 16px;
		align-items: center;
		font-weight: 700;
	}
	.status-pill .side {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.status-pill .tag {
		opacity: 0.85;
	}
	.status-pill .sep {
		opacity: 0.5;
		margin: 0 4px;
	}
	.status-pill .vs {
		opacity: 0.8;
	}

	.center-right {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: stretch;
	}
	.logbox {
		width: min(540px, 46vw);
		height: 160px;
		overflow: auto;
		padding: 8px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.25);
		color: #d6e6e9;
		font-size: 12px;
		line-height: 1.25;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.logline {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}

	.notice {
		border-radius: 10px;
		padding: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
	}
	.notice .title {
		font-weight: 800;
		margin-bottom: 4px;
	}
	.notice .msg {
		opacity: 0.95;
		margin-bottom: 8px;
	}
	.notice.warn {
		background: rgba(255, 193, 7, 0.08);
		color: #ffe9b3;
	}
	.notice.success {
		background: rgba(0, 180, 60, 0.1);
		color: #c6f5d6;
	}
	.notice.error {
		background: rgba(200, 0, 0, 0.1);
		color: #ffd6d6;
	}
	.btn {
		background: #b07500;
		color: white;
		border-radius: 8px;
		padding: 6px 10px;
	}
	.btn:hover {
		background: #915f00;
	}
	.btn.ghost {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: #e7f2f3;
	}
	.btn.ghost:hover {
		background: rgba(255, 255, 255, 0.06);
	}

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
		border-radius: 10px;
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
