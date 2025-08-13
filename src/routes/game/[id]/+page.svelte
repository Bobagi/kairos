<!-- src/routes/game/[id]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';

	// overlays
	let frameOverlayUrl: string | null = '/frames/default.png';
	const titleOverlayUrl = '/frames/title.png';
	const cardBackImageUrl = '/frames/card-back.png';

	// UI state
	let errorMessage: string | null = null;
	let finalResult: { winner: string | null; log: string[] } | null = null;

	// rota
	$: gameId = $page.params.id;

	// cartas – largura responsiva compartilhada por deck/mão
	const cardWidthCss = 'clamp(104px, 17.5vw, 200px)';

	// ---------- mão com UIDs + flip ----------
	type HandItem = { code: string; uid: string };
	let handItems: HandItem[] = [];
	const pendingReveal = new Set<string>();
	let flipCycle = 0;

	function makeUid() {
		return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	}

	function reconcileHand(
		prev: HandItem[],
		codes: string[]
	): { items: HandItem[]; created: string[] } {
		const old = prev.map((p) => p.code);
		const nw = codes;
		const n = old.length,
			m = nw.length;
		const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
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

	// ---------- helpers ----------
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

	async function loadTemplatesOnce() {
		try {
			const res = await fetch('/game/templates');
			const templates = (await res.json()) as Array<{ frameUrl?: string }>;
			const remote =
				Array.isArray(templates) && templates[0]?.frameUrl ? templates[0].frameUrl : null;
			if (remote) frameOverlayUrl = remote;
		} catch {
			/* ignore */
		}
	}

	// guardamos último HP/Deck conhecidos para exibir quando a partida terminar
	let lastHpA = 0,
		lastHpB = 0,
		lastDeckA = 0,
		lastDeckB = 0,
		lastOppHandCount = 0;

	async function loadStateOrResult() {
		errorMessage = null;
		try {
			const state = (await getGameState(gameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalResult = null;
				game.set(state);

				const aId = state.players[0];
				const bId = state.players[1];

				lastHpA = state.hp?.[aId] ?? lastHpA;
				lastHpB = state.hp?.[bId] ?? lastHpB;
				lastDeckA = Array.isArray(state.decks?.[aId]) ? state.decks[aId].length : lastDeckA;
				lastDeckB = Array.isArray(state.decks?.[bId]) ? state.decks[bId].length : lastDeckB;
				lastOppHandCount = Array.isArray(state.hands?.[bId])
					? state.hands[bId].length
					: lastOppHandCount;

				const codes = Array.isArray(state.hands?.[aId]) ? (state.hands[aId] as string[]) : [];
				const { items, created } = reconcileHand(handItems, codes);
				handItems = items;
				if (created.length) {
					created.forEach((u) => pendingReveal.add(u));
					flipCycle++;
				}
				return;
			}
		} catch {
			/* try result */
		}

		try {
			const result = await getGameResult(gameId);
			finalResult = result;
			// mantemos o último estado conhecido de HP/Deck na UI
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
		setupHandResize();
	});

	// ---------- reativos ----------
	$: playerIdA = $game?.players?.[0] ?? 'playerA';
	$: playerIdB = $game?.players?.[1] ?? 'playerB';

	// exibimos valores do estado atual OU o último conhecido
	$: hpA = $game?.hp?.[playerIdA] ?? lastHpA;
	$: hpB = $game?.hp?.[playerIdB] ?? lastHpB;
	$: deckCountA = Array.isArray($game?.decks?.[playerIdA])
		? $game!.decks[playerIdA].length
		: lastDeckA;
	$: deckCountB = Array.isArray($game?.decks?.[playerIdB])
		? $game!.decks[playerIdB].length
		: lastDeckB;
	$: oppHandCount = Array.isArray($game?.hands?.[playerIdB])
		? $game!.hands[playerIdB].length
		: lastOppHandCount;

	function handleFlipEnd(uid: string) {
		pendingReveal.delete(uid);
	}

	// ---------- log: classificação por cor ----------
	function classifyLog(line: string): 'me' | 'opp' | 'sys' {
		const s = line.trim();

		// Player <Name> played ...
		const m = /^Player\s+(.+?)\s+played/i.exec(s);
		if (m) {
			const actor = m[1].toLowerCase();
			const me = (playerIdA ?? '').toLowerCase();
			return actor === me ? 'me' : 'opp';
		}

		// BOT played ...
		if (/^bot\s+played/i.test(s)) return 'opp';

		// Qualquer outra coisa (draw, "Game started", etc.)
		return 'sys';
	}

	// ---------- leque dinâmico (usa toda a largura) ----------
	let myHandEl: HTMLDivElement | null = null;
	let mySpreadPx: number | null = null;

	function computeSpread() {
		const n = Math.max(1, handItems.length);
		const w = myHandEl?.clientWidth ?? 0;
		// abre mais quando há espaço; limites de segurança
		const spread = Math.min(42, Math.max(10, (w / n) * 0.22));
		mySpreadPx = spread;
	}
	function setupHandResize() {
		const ro = new ResizeObserver(() => computeSpread());
		if (myHandEl) ro.observe(myHandEl);
	}
	$: computeSpread(); // recalcula quando a mão muda
</script>

<div class="board">
	<!-- ZONA OPONENTE -->
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerIdB}</span>
			<span class="pill hp">❤️ {hpB}</span>
			<span class="pill deck">🃏 {deckCountB}</span>
		</div>

		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={deckCountB}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					{cardWidthCss}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					direction="right"
				/>
			</div>

			<div class="hand opp-hand fan">
				{#each Array.from({ length: oppHandCount }) as _, i}
					<div class="card-socket" style={`width:${cardWidthCss}; --i:${i}; --n:${oppHandCount}`}>
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
		</div>
	</section>

	<!-- ZONA CENTRAL -->
	<section class="zone center">
		<div class="status-pill">
			<div class="side">
				<span class="tag">👤</span><span class="who">{playerIdA}</span><span class="sep">•</span>
				<span class="tag">❤️</span>{hpA}<span class="sep">•</span><span class="tag">🃏</span
				>{deckCountA}
			</div>
			<div class="vs">VS</div>
			<div class="side">
				<span class="tag">👤</span><span class="who">{playerIdB}</span><span class="sep">•</span>
				<span class="tag">❤️</span>{hpB}<span class="sep">•</span><span class="tag">🃏</span
				>{deckCountB}
			</div>
		</div>

		<div class="center-right">
			{#if finalResult}
				<div class="notice success">
					<div class="title">Game finished</div>
					{#if finalResult.winner === null}
						<div class="msg">Tie game.</div>
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
					{#each $game.log as line}
						<div class={`logline ${classifyLog(line)}`}>{line}</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- ZONA JOGADOR -->
	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerIdA}</span>
			<span class="pill hp">❤️ {hpA}</span>
			<span class="pill deck">🃏 {deckCountA}</span>
		</div>

		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={deckCountA}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					{cardWidthCss}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					direction="right"
				/>
			</div>

			<div
				class="hand my-hand fan"
				bind:this={myHandEl}
				style={`--spread-override:${mySpreadPx ? mySpreadPx + 'px' : ''}`}
			>
				{#each handItems as it, i (it.uid)}
					{#key it.uid}
						<button
							type="button"
							class="card-socket focus:outline-none"
							style={`width:${cardWidthCss}; --i:${i}; --n:${handItems.length}`}
							title={`Play ${it.code}`}
							on:click={() => onPlayCard(it.code)}
						>
							<div class="flip-wrap" data-cycle={flipCycle}>
								<div
									class="flipper"
									class:animate={pendingReveal.has(it.uid)}
									class:start-back={pendingReveal.has(it.uid)}
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
		padding: 10px 14px;
	}

	.zone {
		border-radius: 12px;
		padding: 14px 16px;
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

	/* duas colunas – deck fixo à esquerda, leque ocupa o resto */
	.zone-row.two-cols {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: start;
		overflow: visible;
	}
	.deck-col {
		justify-self: start;
		align-self: start;
		margin-top: 2px;
	}

	/* ---------- FAN LAYOUT ---------- */
	.hand {
		overflow: visible;
	}
	.hand.fan {
		position: relative;
		display: block;
		width: 100%;
		height: clamp(140px, 34vh, 260px);
	}
	.hand.fan .card-socket {
		position: absolute;
		top: 50%;
		left: 50%;
		aspect-ratio: 430/670;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		transform-style: preserve-3d;
		border-radius: 10px;

		--center: calc((var(--n) - 1) / 2);
		--offset: calc(var(--i) - var(--center));
		--spread: var(--spread-override, clamp(12px, 2.6vw, 30px));
		--rot: 6deg;
		--y: 0px;

		transform: translate(-50%, -50%) translateX(calc(var(--spread) * var(--offset)))
			translateY(var(--y)) rotate(calc(var(--rot) * var(--offset)));
		z-index: calc(200 + var(--i));
		transition:
			transform 140ms ease,
			filter 140ms ease;
	}

	/* minha mão – curva para cima e abre mais */
	.my-hand.fan .card-socket {
		transform-origin: bottom center;
		--rot: 5deg;
		--y: calc(-10px + 4px * abs(var(--offset)));
	}

	/* oponente – curva para baixo, mais compacta */
	.opp-hand.fan .card-socket {
		transform-origin: top center;
		--rot: -6deg;
		--y: calc(10px - 4px * abs(var(--offset)));
		z-index: calc(100 + (var(--n) - var(--i)));
	}

	/* hover levanta e traz para frente (minha mão) */
	.my-hand.fan .card-socket:hover,
	.my-hand.fan .card-socket:focus-visible {
		transform: translate(-50%, -50%) translateX(calc(var(--spread) * var(--offset)))
			translateY(calc(var(--y) - 18px)) rotate(calc(var(--rot) * var(--offset))) scale(1.06);
		z-index: 999;
		filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.45));
	}

	.card-back-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 430/670;
		border-radius: 10px;
		box-shadow: 0 10px 26px rgba(0, 0, 0, 0.42);
	}

	/* -------- STATUS / NOTICES -------- */
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

	.notice {
		border-radius: 10px;
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
	}
	.notice .title {
		font-weight: 800;
		margin-bottom: 4px;
	}
	.notice .msg {
		opacity: 0.95;
		margin: 6px 0 10px;
	}
	.notice .actions {
		display: flex;
		gap: 8px;
	}
	.notice.success {
		background: rgba(0, 180, 60, 0.1);
		color: #c6f5d6;
		border-color: rgba(0, 180, 60, 0.18);
	}
	.notice.warn {
		background: rgba(255, 193, 7, 0.1);
		color: #ffe9b3;
		border-color: rgba(255, 193, 7, 0.22);
	}
	.notice.error {
		background: rgba(200, 0, 0, 0.1);
		color: #ffd6d6;
		border-color: rgba(200, 0, 0, 0.22);
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

	/* -------- LOG COLORIDO -------- */
	.center-right {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: stretch;
	}
	.logbox {
		width: min(540px, 46vw);
		height: 200px;
		overflow: auto;
		padding: 8px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.25);
		color: #e7f2f3;
		font-size: 13px;
		line-height: 1.25;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.logline {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		padding: 2px 0;
	}
	.logline.me {
		color: #b9f4c8;
		font-weight: 600;
	} /* você */
	.logline.opp {
		color: #ffb3b3;
		font-weight: 600;
	} /* oponente */
	.logline.sys {
		color: #e7f2f3;
	}
	/* -------- FLIP -------- */
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
		/* sem animação = frente visível */
		transform: rotateY(0deg);
	}
	.flipper.start-back {
		/* novas cartas começam viradas pro verso */
		transform: rotateY(180deg);
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
