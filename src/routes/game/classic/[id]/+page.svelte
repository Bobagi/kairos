<script lang="ts">
	import { page as sveltePageStore } from '$app/stores';
	import {
		getCardMetas,
		getGameResult,
		getGameState,
		playCard,
		skipTurn
	} from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import CenterPanel from '$lib/components/CenterPanel.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import PlayFXOverlay from '$lib/components/PlayFXOverlay.svelte';
	import { fx as visualEffectsStore } from '$lib/stores/fx';
	import { game as gameStateStore, type GameState } from '$lib/stores/game';
	import { onMount } from 'svelte';
	import '../../game.css';

	export const FLIP_MS = 900;

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

	const makeUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

	function reconcile(prev: HandCardItem[], nextCodes: string[]) {
		const need = new Map<string, number>();
		for (const c of nextCodes) need.set(c, (need.get(c) ?? 0) + 1);
		const reused: HandCardItem[] = [];
		for (const it of prev) {
			const left = need.get(it.code) ?? 0;
			if (left > 0) {
				reused.push(it);
				need.set(it.code, left - 1);
			}
		}
		const created: string[] = [];
		const result: HandCardItem[] = [...reused];
		for (const [code, cnt] of need.entries()) {
			for (let i = 0; i < cnt; i++) {
				const uid = makeUid();
				result.push({ code, uid });
				created.push(uid);
			}
		}
		result.sort((a, b) => nextCodes.indexOf(a.code) - nextCodes.indexOf(b.code));
		return { items: result, created };
	}

	const cardDetailsCacheByCode = new Map<string, CardDetails>();
	async function ensureCodesCached(codes: string[]) {
		const missing = codes.filter((c) => !cardDetailsCacheByCode.has(c));
		if (!missing.length) return;
		const metas = await getCardMetas(missing);
		for (const m of metas) {
			cardDetailsCacheByCode.set(m.code, {
				code: m.code,
				name: m.name,
				description: m.description,
				imageUrl: (m as any).image ?? (m as any).imageUrl,
				might: m.might,
				fire: m.fire,
				magic: m.magic
			});
		}
	}

	async function fetchTemplate() {
		try {
			const resp = await fetch('/game/templates');
			const templates = (await resp.json()) as Array<{ frameUrl?: string }>;
			const remote =
				Array.isArray(templates) && templates[0]?.frameUrl ? templates[0].frameUrl : null;
			if (remote) frameOverlayImageUrl = remote;
		} catch {}
	}

	async function loadGameStateOrFinalResult() {
		errorMessageText = null;
		try {
			const state = (await getGameState(currentGameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalGameResult = null;
				gameStateStore.set({ ...state, gameId: currentGameId });
				const me = state.players[0];
				const myCodes = Array.isArray(state.hands?.[me]) ? (state.hands[me] as string[]) : [];
				const { items, created } = reconcile(playerHandCardItems, myCodes);
				playerHandCardItems = items;
				if (myCodes.length) await ensureCodesCached(myCodes);
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
				if (created.length) {
					created.forEach((u) => pendingCardRevealUidSet.add(u));
					autoFlipCycleCounter++;
				}
				return;
			}
		} catch {}
		try {
			finalGameResult = await getGameResult(currentGameId);
		} catch {
			errorMessageText = 'Could not load game state';
		}
	}

	function isGameOver(): boolean {
		return Boolean(finalGameResult?.winner ?? $gameStateStore?.winner ?? false);
	}

	let opponentHpPillElement: HTMLSpanElement | null = null;
	let myHpPillElement: HTMLSpanElement | null = null;

	function effectFor(code: string) {
		switch (code) {
			case 'lightning':
				return { kind: 'damage', amount: 3, target: 'opp' as const };
			case 'fireball':
				return { kind: 'damage', amount: 5, target: 'opp' as const };
			case 'heal':
				return { kind: 'heal', amount: 4, target: 'me' as const };
			default:
				return { kind: 'damage', amount: 1, target: 'opp' as const };
		}
	}
	const artFor = (code: string) => cardDetailsCacheByCode.get(code)?.imageUrl;

	function playWithFX(e: MouseEvent, code: string) {
		if (isGameOver()) return;
		const fromRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const { kind, amount, target } = effectFor(code);
		const targetEl = target === 'opp' ? opponentHpPillElement : myHpPillElement;
		if (targetEl) {
			const targetRect = targetEl.getBoundingClientRect();
			visualEffectsStore.start({
				fromRect,
				targetRect,
				imgUrl: artFor(code) ?? '',
				frameUrl: frameOverlayImageUrl,
				kind,
				amount
			});
		}
		playCard(currentGameId, $gameStateStore!.players[0], code).then(loadGameStateOrFinalResult);
	}

	async function skipTurnClassic() {
		if (isGameOver()) return;
		const me = $gameStateStore?.players?.[0] ?? 'playerA';
		await skipTurn(currentGameId, me);
		await loadGameStateOrFinalResult();
	}

	onMount(async () => {
		await fetchTemplate();
		await loadGameStateOrFinalResult();
		setupMyHandResizeObserver();
	});

	$: playerA = $gameStateStore?.players?.[0] ?? 'playerA';
	$: playerB = $gameStateStore?.players?.[1] ?? 'playerB';

	$: hpA = $gameStateStore?.hp?.[playerA] ?? 0;
	$: hpB = $gameStateStore?.hp?.[playerB] ?? 0;

	$: deckA = Array.isArray($gameStateStore?.decks?.[playerA])
		? $gameStateStore!.decks[playerA].length
		: 0;
	$: deckB = Array.isArray($gameStateStore?.decks?.[playerB])
		? $gameStateStore!.decks[playerB].length
		: 0;

	$: oppHandCount = Array.isArray($gameStateStore?.hands?.[playerB])
		? $gameStateStore!.hands[playerB].length
		: 0;

	let myHandContainerElement: HTMLDivElement | null = null;
	let myHandCardSpreadPixels: number | null = null;
	function computeSpread() {
		const count = Math.max(1, playerHandCardItems.length);
		const w = myHandContainerElement?.clientWidth ?? 0;
		myHandCardSpreadPixels = Math.min(46, Math.max(10, (w / count) * 0.24));
	}
	function setupMyHandResizeObserver() {
		const ro = new ResizeObserver(() => computeSpread());
		if (myHandContainerElement) ro.observe(myHandContainerElement);
	}
	$: computeSpread();

	$: myHandEmpty = playerHandCardItems.length === 0;
	$: myDeckEmpty = deckA === 0;
	$: oppHandEmpty = oppHandCount === 0;
	$: oppDeckEmpty = deckB === 0;
	$: currentTurnIndex = typeof $gameStateStore?.turn === 'number' ? $gameStateStore.turn % 2 : 0;
	$: isMyTurn = ($gameStateStore?.players?.[currentTurnIndex] ?? playerA) === playerA;
	$: showLocalSkip =
		!isGameOver() && isMyTurn && myHandEmpty && myDeckEmpty && oppHandEmpty && oppDeckEmpty;
</script>

<div class="fixed-top-bar">
	<a href="/" class="home-btn">← Home</a>
	<div class="mode-pill"><strong>Mode:</strong> CLASSIC</div>
</div>

<div class="board" style="padding-top:50px;">
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerB}</span>
			<span class="pill hp" bind:this={opponentHpPillElement}>❤️ {hpB}</span>
			<span class="pill deck">🃏 {deckB}</span>
		</div>
		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={deckB}
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
				{#each Array.from({ length: oppHandCount }) as _, i}
					<div
						class="card-socket"
						style={`width:${cardWidthCssValue}; --i:${i}; --n:${oppHandCount}`}
					>
						<div class="card-back-wrap" title="Opponent card">
							<img
								src="/frames/card-back.png"
								alt="card-back"
								style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;"
							/>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<CenterPanel
		{playerA}
		{playerB}
		{hpA}
		{hpB}
		{deckA}
		{deckB}
		finalResult={finalGameResult}
		endedDueToNoCards={false}
		errorMessage={errorMessageText}
		log={$gameStateStore?.log}
		onRefresh={loadGameStateOrFinalResult}
		onSkipTurn={skipTurnClassic}
	/>

	{#if ($gameStateStore?.winner ?? finalGameResult?.winner ?? null) !== null}
		<div class="notice success" style="margin-top:12px; text-align:center;">
			Winner: {$gameStateStore?.winner ?? finalGameResult?.winner}
		</div>
		<div style="margin-top:8px;text-align:center;">
			<a href="/" class="btn" style="text-decoration:none;">Back to home</a>
		</div>
	{/if}

	{#if showLocalSkip}
		<div
			class="notice warn"
			style="margin:10px auto;max-width:560px;display:flex;justify-content:space-between;align-items:center;gap:10px;"
		>
			<div class="msg">No cards remaining for either side. You can skip your turn.</div>
			<button type="button" class="btn" on:click={skipTurnClassic}>Skip Turn</button>
		</div>
	{/if}

	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerA}</span>
			<span class="pill hp" bind:this={myHpPillElement}>❤️ {hpA}</span>
			<span class="pill deck">🃏 {deckA}</span>
		</div>
		<div class="zone-row two-cols">
			<div class="deck-col">
				<DeckStack
					deckCount={deckA}
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
							disabled={Boolean($gameStateStore?.winner)}
							style={`width:${cardWidthCssValue}; --i:${i}; --n:${playerHandCardItems.length}; ${$gameStateStore?.winner ? 'opacity:.6;cursor:not-allowed;' : ''}`}
							title={`Play ${it.name ?? it.code}`}
							on:click={(e) => playWithFX(e, it.code)}
						>
							<div class="flip-wrap" data-cycle={autoFlipCycleCounter}>
								<div
									class="flipper"
									class:animate={pendingCardRevealUidSet.has(it.uid)}
									class:start-back={pendingCardRevealUidSet.has(it.uid)}
									on:animationend={() => pendingCardRevealUidSet.delete(it.uid)}
									style={`--flip-ms:${FLIP_MS}ms;`}
								>
									<div class="face front">
										<CardComposite
											artImageUrl={it.imageUrl ?? ''}
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
