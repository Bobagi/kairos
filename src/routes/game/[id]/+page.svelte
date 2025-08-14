<!-- src/routes/game/[id]/+page.svelte -->
<script lang="ts">
	import { page as sveltePageStore } from '$app/stores';
	import { getGameResult, getGameState, playCard, skipTurn } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import CenterPanel from '$lib/components/CenterPanel.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import PlayFXOverlay from '$lib/components/PlayFXOverlay.svelte';
	import { fx as visualEffectsStore } from '$lib/stores/fx';
	import { game as gameStateStore, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';
	import './board.css';
	import './flip.css';
	import './hands.css';
	import './log.css';
	import './notices.css';
	import './zones.css';

	type CardDetails = {
		code: string;
		name: string;
		description: string;
		imageUrl: string;
		might: number;
		fire: number;
		magic: number;
	};

	let frameOverlayImageUrl: string | null = '/frames/default.png';
	const titleOverlayImageUrl = '/frames/title.png';
	const cardBackImageUrl = '/frames/card-back.png';

	let errorMessageText: string | null = null;
	let finalGameResult: { winner: string | null; log: string[] } | null = null;

	$: currentGameId = $sveltePageStore.params.id;

	const cardWidthCssValue = 'clamp(104px, 17.5vw, 200px)';

	type HandCardItem = {
		code: string;
		uid: string;
		name?: string;
		description?: string;
		imageUrl?: string;
		might?: number;
		fire?: number;
		magic?: number;
	};
	let playerHandCardItems: HandCardItem[] = [];
	const pendingCardRevealUidSet = new Set<string>();
	let autoFlipCycleCounter = 0;

	const cardDetailsCacheByCode = new Map<string, CardDetails>();

	function generateStableUid() {
		return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	}

	function reconcileHandItemsKeepingStableUids(
		previousItems: HandCardItem[],
		nextCodes: string[]
	): { items: HandCardItem[]; created: string[] } {
		const oldCodes = previousItems.map((p) => p.code);
		const newCodes = nextCodes;
		const n = oldCodes.length;
		const m = newCodes.length;
		const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
		for (let i = n - 1; i >= 0; i--)
			for (let j = m - 1; j >= 0; j--)
				dp[i][j] =
					oldCodes[i] === newCodes[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
		const indexMap = new Map<number, number>();
		let i = 0,
			j = 0;
		while (i < n && j < m) {
			if (oldCodes[i] === newCodes[j]) {
				indexMap.set(i, j);
				i++;
				j++;
			} else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
			else j++;
		}
		const usedOldIndexes = new Set<number>();
		const createdUids: string[] = [];
		const reconciledItems: HandCardItem[] = [];
		for (let newIndex = 0; newIndex < m; newIndex++) {
			let reused = false;
			for (const [oldIndex, mappedNewIndex] of indexMap) {
				if (mappedNewIndex === newIndex && !usedOldIndexes.has(oldIndex)) {
					reconciledItems.push(previousItems[oldIndex]);
					usedOldIndexes.add(oldIndex);
					reused = true;
					break;
				}
			}
			if (!reused) {
				const uid = generateStableUid();
				reconciledItems.push({ code: newCodes[newIndex], uid });
				createdUids.push(uid);
			}
		}
		return { items: reconciledItems, created: createdUids };
	}

	function buildFallbackArtImageUrlForCode(code: string): string {
		return `https://bobagi.click/images/cards/${code.includes('-') ? `${code}.png` : code === 'fireball' ? 'flamed-leaf.png' : code === 'heal' ? 'remedy.png' : code === 'lightning' ? 'power-lightning.png' : `${code}.png`}`;
	}

	async function fetchAndApplyRemoteFrameTemplateIfAvailable() {
		try {
			const response = await fetch('/game/templates');
			const templates = (await response.json()) as Array<{ frameUrl?: string }>;
			const remote =
				Array.isArray(templates) && templates[0]?.frameUrl ? templates[0].frameUrl : null;
			if (remote) frameOverlayImageUrl = remote;
		} catch {}
	}

	async function fetchCardDetailsByCodes(codes: string[]) {
		const unique = Array.from(new Set(codes.filter((c) => !cardDetailsCacheByCode.has(c))));
		if (unique.length === 0) return;
		try {
			const response = await fetch(`/game/cards?codes=${encodeURIComponent(unique.join(','))}`);
			const arr = (await response.json()) as CardDetails[];
			for (const d of arr) cardDetailsCacheByCode.set(d.code, d);
		} catch {}
	}

	function applyCachedDetailsIntoHandItems() {
		playerHandCardItems = playerHandCardItems.map((it) => {
			const d = cardDetailsCacheByCode.get(it.code);
			return d
				? {
						...it,
						name: d.name,
						description: d.description,
						imageUrl: d.imageUrl,
						might: d.might,
						fire: d.fire,
						magic: d.magic
					}
				: it;
		});
	}

	let lastKnownHpForPlayerA = 0;
	let lastKnownHpForPlayerB = 0;
	let lastKnownDeckCountForPlayerA = 0;
	let lastKnownDeckCountForPlayerB = 0;
	let lastKnownOpponentHandCount = 0;

	async function loadGameStateOrFinalResult() {
		errorMessageText = null;
		try {
			const state = (await getGameState(currentGameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalGameResult = null;
				gameStateStore.set(state);
				const playerAId = state.players[0];
				const playerBId = state.players[1];
				lastKnownHpForPlayerA = state.hp?.[playerAId] ?? lastKnownHpForPlayerA;
				lastKnownHpForPlayerB = state.hp?.[playerBId] ?? lastKnownHpForPlayerB;
				lastKnownDeckCountForPlayerA = Array.isArray(state.decks?.[playerAId])
					? state.decks[playerAId].length
					: lastKnownDeckCountForPlayerA;
				lastKnownDeckCountForPlayerB = Array.isArray(state.decks?.[playerBId])
					? state.decks[playerBId].length
					: lastKnownDeckCountForPlayerB;
				lastKnownOpponentHandCount = Array.isArray(state.hands?.[playerBId])
					? state.hands[playerBId].length
					: lastKnownOpponentHandCount;
				const codes = Array.isArray(state.hands?.[playerAId])
					? (state.hands[playerAId] as string[])
					: [];
				const { items, created } = reconcileHandItemsKeepingStableUids(playerHandCardItems, codes);
				playerHandCardItems = items;
				if (codes.length) await fetchCardDetailsByCodes(codes);
				applyCachedDetailsIntoHandItems();
				if (created.length) {
					created.forEach((u) => pendingCardRevealUidSet.add(u));
					autoFlipCycleCounter++;
				}
				return;
			}
		} catch {}
		try {
			const result = await getGameResult(currentGameId);
			finalGameResult = result;
		} catch {
			errorMessageText = 'Could not load game state';
		}
	}

	async function handlePlayCardAction(cardCode: string) {
		const playerAId = $gameStateStore?.players?.[0] ?? 'playerA';
		try {
			await playCard(currentGameId, playerAId, cardCode);
		} catch {}
		await loadGameStateOrFinalResult();
	}
	async function handleSkipTurnAction() {
		const playerAId = $gameStateStore?.players?.[0] ?? 'playerA';
		try {
			await skipTurn(currentGameId, playerAId);
		} catch {}
		await loadGameStateOrFinalResult();
	}

	onMount(async () => {
		await fetchAndApplyRemoteFrameTemplateIfAvailable();
		await loadGameStateOrFinalResult();
		setupMyHandResizeObserver();
	});

	$: playerIdPlayerA = $gameStateStore?.players?.[0] ?? 'playerA';
	$: playerIdPlayerB = $gameStateStore?.players?.[1] ?? 'playerB';

	$: currentHpForPlayerA = $gameStateStore?.hp?.[playerIdPlayerA] ?? lastKnownHpForPlayerA;
	$: currentHpForPlayerB = $gameStateStore?.hp?.[playerIdPlayerB] ?? lastKnownHpForPlayerB;
	$: currentDeckCountForPlayerA = Array.isArray($gameStateStore?.decks?.[playerIdPlayerA])
		? $gameStateStore!.decks[playerIdPlayerA].length
		: lastKnownDeckCountForPlayerA;
	$: currentDeckCountForPlayerB = Array.isArray($gameStateStore?.decks?.[playerIdPlayerB])
		? $gameStateStore!.decks[playerIdPlayerB].length
		: lastKnownDeckCountForPlayerB;
	$: currentOpponentHandCount = Array.isArray($gameStateStore?.hands?.[playerIdPlayerB])
		? $gameStateStore!.hands[playerIdPlayerB].length
		: lastKnownOpponentHandCount;

	$: gameEndedDueToNoCards =
		Array.isArray(finalGameResult?.log) && finalGameResult!.log.some((l) => /no cards/i.test(l));

	$: displayedHpForPlayerA =
		!finalGameResult || gameEndedDueToNoCards
			? currentHpForPlayerA
			: finalGameResult.winner === playerIdPlayerB
				? 0
				: currentHpForPlayerA;
	$: displayedHpForPlayerB =
		!finalGameResult || gameEndedDueToNoCards
			? currentHpForPlayerB
			: finalGameResult.winner === playerIdPlayerA
				? 0
				: currentHpForPlayerB;

	function handleFlipAnimationEndForUid(uid: string) {
		pendingCardRevealUidSet.delete(uid);
	}

	let myHandContainerElement: HTMLDivElement | null = null;
	let myHandCardSpreadPixels: number | null = null;

	function computeMyHandCardSpreadPixels() {
		const count = Math.max(1, playerHandCardItems.length);
		const containerWidth = myHandContainerElement?.clientWidth ?? 0;
		const spread = Math.min(46, Math.max(10, (containerWidth / count) * 0.24));
		myHandCardSpreadPixels = spread;
	}
	function setupMyHandResizeObserver() {
		const ro = new ResizeObserver(() => computeMyHandCardSpreadPixels());
		if (myHandContainerElement) ro.observe(myHandContainerElement);
	}
	$: computeMyHandCardSpreadPixels();

	let opponentHpPillElement: HTMLSpanElement | null = null;
	let myHpPillElement: HTMLSpanElement | null = null;

	type CardEffectDescriptor = { kind: 'damage' | 'heal'; amount: number; target: 'opp' | 'me' };
	function getCardEffectDescriptorForCode(code: string): CardEffectDescriptor {
		switch (code) {
			case 'lightning':
				return { kind: 'damage', amount: 3, target: 'opp' };
			case 'fireball':
				return { kind: 'damage', amount: 5, target: 'opp' };
			case 'heal':
				return { kind: 'heal', amount: 4, target: 'me' };
			default:
				return { kind: 'damage', amount: 1, target: 'opp' };
		}
	}

	function getArtUrlForEffectsByCode(code: string) {
		const d = cardDetailsCacheByCode.get(code);
		return d?.imageUrl ?? buildFallbackArtImageUrlForCode(code);
	}

	function playCardWithVisualEffects(e: MouseEvent, code: string) {
		const fromRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const { kind, amount, target } = getCardEffectDescriptorForCode(code);
		const targetElement = target === 'opp' ? opponentHpPillElement : myHpPillElement;
		if (targetElement) {
			const targetRect = targetElement.getBoundingClientRect();
			visualEffectsStore.start({
				fromRect,
				targetRect,
				imgUrl: getArtUrlForEffectsByCode(code),
				frameUrl: frameOverlayImageUrl,
				kind,
				amount
			});
		}
		handlePlayCardAction(code);
	}
</script>

<div class="board">
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerIdPlayerB}</span>
			<span class="pill hp" bind:this={opponentHpPillElement}>❤️ {displayedHpForPlayerB}</span>
			<span class="pill deck">🃏 {currentDeckCountForPlayerB}</span>
		</div>

		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={currentDeckCountForPlayerB}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					cardWidthCss={cardWidthCssValue}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					direction="right"
				/>
			</div>

			<div class="hand opp-hand fan">
				{#each Array.from({ length: currentOpponentHandCount }) as _, i}
					<div
						class="card-socket"
						style={`width:${cardWidthCssValue}; --i:${i}; --n:${currentOpponentHandCount}`}
					>
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

	<CenterPanel
		playerA={playerIdPlayerA}
		playerB={playerIdPlayerB}
		hpA={displayedHpForPlayerA}
		hpB={displayedHpForPlayerB}
		deckA={currentDeckCountForPlayerA}
		deckB={currentDeckCountForPlayerB}
		finalResult={finalGameResult}
		endedDueToNoCards={gameEndedDueToNoCards}
		errorMessage={errorMessageText}
		log={$gameStateStore?.log}
		onRefresh={loadGameStateOrFinalResult}
		onSkipTurn={handleSkipTurnAction}
	/>

	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerIdPlayerA}</span>
			<span class="pill hp" bind:this={myHpPillElement}>❤️ {displayedHpForPlayerA}</span>
			<span class="pill deck">🃏 {currentDeckCountForPlayerA}</span>
		</div>

		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={currentDeckCountForPlayerA}
					cardBackImageUrl="/frames/card-back.png"
					aspectWidth={430}
					aspectHeight={670}
					cardWidthCss={cardWidthCssValue}
					maxVisible={7}
					offsetXPx={4}
					offsetYPx={3}
					direction="right"
				/>
			</div>

			<div
				class="hand my-hand fan"
				bind:this={myHandContainerElement}
				style={`--spread-override:${myHandCardSpreadPixels ? myHandCardSpreadPixels + 'px' : ''}`}
			>
				{#each playerHandCardItems as it, i (it.uid)}
					{#key it.uid}
						<button
							type="button"
							class="card-socket focus:outline-none"
							style={`width:${cardWidthCssValue}; --i:${i}; --n:${playerHandCardItems.length}`}
							title={`Play ${it.name ?? it.code}`}
							on:click={(e) => playCardWithVisualEffects(e, it.code)}
						>
							<div class="flip-wrap" data-cycle={autoFlipCycleCounter}>
								<div
									class="flipper"
									class:animate={pendingCardRevealUidSet.has(it.uid)}
									class:start-back={pendingCardRevealUidSet.has(it.uid)}
									on:animationend={() => handleFlipAnimationEndForUid(it.uid)}
									style="--flip-ms:700ms;"
								>
									<div class="face front">
										<CardComposite
											artImageUrl={it.imageUrl ?? buildFallbackArtImageUrlForCode(it.code)}
											frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
											titleImageUrl={titleOverlayImageUrl}
											titleText={it.name ?? it.code}
											aspectWidth={430}
											aspectHeight={670}
											artObjectFit="cover"
											enableTilt={true}
											descriptionText={it.description ?? ''}
											magicValue={it.magic ?? 0}
											mightValue={it.might ?? 0}
											fireValue={it.fire ?? 0}
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

<PlayFXOverlay />
