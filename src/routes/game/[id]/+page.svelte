<script lang="ts">
	import { page } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import CenterPanel from '$lib/components/CenterPanel.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';
	/* ===== global CSS for this route ===== */
	import './board.css';
	import './flip.css';
	import './hands.css';
	import './log.css';
	import './notices.css';
	import './zones.css';

	// overlays
	let frameOverlayUrl: string | null = '/frames/default.png';
	const titleOverlayUrl = '/frames/title.png';
	const cardBackImageUrl = '/frames/card-back.png';

	// UI state
	let errorMessage: string | null = null;
	let finalResult: { winner: string | null; log: string[] } | null = null;

	// route param
	$: gameId = $page.params.id;

	// shared responsive width for cards (deck and hand)
	const cardWidthCss = 'clamp(104px, 17.5vw, 200px)';

	// ---------- hand items with stable UIDs + flip ----------
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
		} catch {}
	}

	// Keep last known values to show after the game ends
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
			/* fall through and try result */
		}
		try {
			const result = await getGameResult(gameId);
			finalResult = result; // show last-known values with winner banner
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

	// ---------- derived values ----------
	$: playerIdA = $game?.players?.[0] ?? 'playerA';
	$: playerIdB = $game?.players?.[1] ?? 'playerB';

	// current or last-known values
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

	// Did the game end due to no cards?
	$: endedDueToNoCards =
		Array.isArray(finalResult?.log) && finalResult!.log.some((l) => /no cards/i.test(l));

	// After finish: clamp losing HP to 0 (except when ended due to no cards)
	$: displayedHpA =
		!finalResult || endedDueToNoCards ? hpA : finalResult.winner === playerIdB ? 0 : hpA;
	$: displayedHpB =
		!finalResult || endedDueToNoCards ? hpB : finalResult.winner === playerIdA ? 0 : hpB;

	function handleFlipEnd(uid: string) {
		pendingReveal.delete(uid);
	}

	// ---------- fan layout (auto spread to fill available width) ----------
	let myHandEl: HTMLDivElement | null = null;
	let mySpreadPx: number | null = null;

	function computeSpread() {
		const n = Math.max(1, handItems.length);
		const w = myHandEl?.clientWidth ?? 0;
		const spread = Math.min(46, Math.max(10, (w / n) * 0.24));
		mySpreadPx = spread;
	}
	function setupHandResize() {
		const ro = new ResizeObserver(() => computeSpread());
		if (myHandEl) ro.observe(myHandEl);
	}
	$: computeSpread(); // recompute whenever the hand changes
</script>

<div class="board">
	<!-- OPPONENT ZONE -->
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerIdB}</span>
			<span class="pill hp">❤️ {displayedHpB}</span>
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

	<!-- CENTER ZONE (moved to component) -->
	<CenterPanel
		playerA={playerIdA}
		playerB={playerIdB}
		hpA={displayedHpA}
		hpB={displayedHpB}
		deckA={deckCountA}
		deckB={deckCountB}
		{finalResult}
		{endedDueToNoCards}
		{errorMessage}
		log={$game?.log}
		onRefresh={loadStateOrResult}
		{onSkipTurn}
	/>

	<!-- PLAYER ZONE -->
	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerIdA}</span>
			<span class="pill hp">❤️ {displayedHpA}</span>
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
