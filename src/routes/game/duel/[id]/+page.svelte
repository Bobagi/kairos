<script lang="ts">
	import { page as sveltePageStore } from '$app/stores';
	import {
		advanceDuel,
		chooseAttributeForDuel,
		chooseCardForDuel,
		getCardMetas,
		getGameResult,
		getGameState
	} from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game as gameStateStore, type GameState } from '$lib/stores/game';
	import { onDestroy, onMount } from 'svelte';
	import '../../game.css';

	export const REVEAL_PAUSE_MS = 2600;
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

	let centerRevealCycle = 0;
	let advanceTimer: number | null = null;

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
				const centers: string[] = [];
				if (state.duelCenter?.aCardCode) centers.push(state.duelCenter.aCardCode);
				if (state.duelCenter?.bCardCode) centers.push(state.duelCenter.bCardCode);
				if (centers.length) await ensureCodesCached(centers);

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

				if (state.mode === 'ATTRIBUTE_DUEL' && state.duelStage === 'REVEAL') {
					centerRevealCycle++;
					if (advanceTimer) window.clearTimeout(advanceTimer);
					advanceTimer = window.setTimeout(async () => {
						try {
							await advanceDuel(currentGameId);
						} finally {
							await loadGameStateOrFinalResult();
						}
					}, REVEAL_PAUSE_MS);
				} else if (advanceTimer) {
					window.clearTimeout(advanceTimer);
					advanceTimer = null;
				}

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

	async function onHandCardClick(e: MouseEvent, code: string) {
		const state = $gameStateStore;
		if (!state || isGameOver()) return;
		if (state.mode !== 'ATTRIBUTE_DUEL') return;
		if (state.duelStage !== 'PICK_CARD') return;

		const me = state.players[0];
		const center = state.duelCenter ?? {};
		const alreadyPicked = !!center.aCardCode;
		if (alreadyPicked) return;

		await ensureCodesCached([code]);

		gameStateStore.update((s) => {
			if (!s) return s as any;
			const nextHand = [...(s.hands[me] ?? [])];
			const idx = nextHand.indexOf(code);
			if (idx !== -1) nextHand.splice(idx, 1);
			const nextCenter: any = { ...(s.duelCenter ?? {}) };
			nextCenter.aCardCode = code;
			if (!nextCenter.chooserId && s.players?.[0]) nextCenter.chooserId = s.players[0];
			return { ...s, hands: { ...s.hands, [me]: nextHand }, duelCenter: nextCenter };
		});

		try {
			await chooseCardForDuel(currentGameId, me, code);
		} finally {
			await loadGameStateOrFinalResult();
		}
	}

	async function chooseAttr(attr: 'magic' | 'might' | 'fire') {
		if (isGameOver()) return;
		const me = $gameStateStore?.players?.[0] ?? 'playerA';
		await chooseAttributeForDuel(currentGameId, me, attr);
		await loadGameStateOrFinalResult();
	}

	onMount(async () => {
		await fetchTemplate();
		await loadGameStateOrFinalResult();
		setupMyHandResizeObserver();
	});
	onDestroy(() => {
		if (advanceTimer) window.clearTimeout(advanceTimer);
	});

	$: playerA = $gameStateStore?.players?.[0] ?? 'playerA';
	$: playerB = $gameStateStore?.players?.[1] ?? 'playerB';

	$: duelStage = $gameStateStore?.duelStage ?? null;
	$: duelCenter = $gameStateStore?.duelCenter ?? null;
	$: chooserId = duelCenter?.chooserId ?? playerA;
	$: discardPiles = $gameStateStore?.discardPiles ?? null;

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
</script>

<div class="fixed-top-bar">
	<a href="/" class="home-btn">← Home</a>
	<div class="mode-pill"><strong>Mode:</strong> ATTRIBUTE_DUEL</div>
</div>

<div class="board" style="padding-top:50px;">
	<section class="zone opponent">
		<div class="zone-header">
			<span class="name">👤 {playerB}</span>
			<span class="pill hp">❤️ {hpB}</span>
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

	<section class="zone center" style="margin:10px auto; max-width:980px;">
		<div class="zone-header">
			<span class="name">⚔️ Attribute Duel</span>
			{#if discardPiles}
				<span class="pill">A discards: {(discardPiles[playerA] ?? []).length}</span>
				<span class="pill">B discards: {(discardPiles[playerB] ?? []).length}</span>
			{/if}
		</div>

		<div class="zone-row two-cols" style="gap:24px; align-items:center; justify-content:center;">
			<div
				class="duel-slot"
				style={`width:${cardWidthCssValue}; height:calc(${cardWidthCssValue} * 1.55);`}
			>
				{#if $gameStateStore?.duelCenter?.aCardCode}
					<div
						class={`result-wrap ${$gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner === playerA ? 'winner-glow' : $gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner && ($gameStateStore?.duelCenter as any)?.roundWinner !== playerA ? 'loser-shake' : ''}`}
					>
						<CardComposite
							artImageUrl={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
								?.imageUrl ?? ''}
							frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
							titleImageUrl={titleOverlayImageUrl}
							titleText={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)?.name ??
								$gameStateStore.duelCenter.aCardCode}
							aspectWidth={430}
							aspectHeight={670}
							artObjectFit="cover"
							enableTilt={false}
							descriptionText={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
								?.description ?? ''}
							magicValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)?.magic ??
								0}
							mightValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)?.might ??
								0}
							fireValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)?.fire ??
								0}
						/>
					</div>
				{:else}
					<span class="placeholder">A: select a card…</span>
				{/if}
			</div>

			<div
				class="duel-slot"
				style={`width:${cardWidthCssValue}; height:calc(${cardWidthCssValue} * 1.55);`}
			>
				{#if $gameStateStore?.duelCenter?.bCardCode}
					<div class="flip-wrap" data-cycle={centerRevealCycle}>
						<div
							class="flipper"
							class:start-back={$gameStateStore?.duelStage !== 'REVEAL'}
							class:animate={$gameStateStore?.duelStage === 'REVEAL'}
							style={`--flip-ms:${FLIP_MS}ms;`}
						>
							<div class="face front">
								<div
									class={`result-wrap ${$gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner === playerB ? 'winner-glow' : $gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner && ($gameStateStore?.duelCenter as any)?.roundWinner !== playerB ? 'loser-shake' : ''}`}
								>
									<CardComposite
										artImageUrl={cardDetailsCacheByCode.get($gameStateStore.duelCenter.bCardCode)
											?.imageUrl ?? ''}
										frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
										titleImageUrl={titleOverlayImageUrl}
										titleText={cardDetailsCacheByCode.get($gameStateStore.duelCenter.bCardCode)
											?.name ?? $gameStateStore.duelCenter.bCardCode}
										aspectWidth={430}
										aspectHeight={670}
										artObjectFit="cover"
										enableTilt={false}
										descriptionText={cardDetailsCacheByCode.get(
											$gameStateStore.duelCenter.bCardCode
										)?.description ?? ''}
										magicValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.bCardCode)
											?.magic ?? 0}
										mightValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.bCardCode)
											?.might ?? 0}
										fireValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.bCardCode)
											?.fire ?? 0}
									/>
								</div>
							</div>
							<div class="face back">
								<img
									src={cardBackImageUrl}
									alt="hidden"
									style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;"
								/>
							</div>
						</div>
					</div>
				{:else}
					<span class="placeholder">B: select a card…</span>
				{/if}
			</div>
		</div>

		{#if duelStage === 'PICK_ATTRIBUTE' && chooserId === playerA}
			<div class="notice chooser" style="margin-top:12px; text-align:center;">
				<span>Choose attribute:</span>
				<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('magic')}
					>MAGIC</button
				>
				<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('might')}
					>MIGHT</button
				>
				<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('fire')}>FIRE</button
				>
			</div>
		{:else if duelStage === 'PICK_ATTRIBUTE'}
			<div class="notice warn" style="margin-top:12px; text-align:center;">
				Waiting for {chooserId} to choose the attribute…
			</div>
		{/if}

		{#if $gameStateStore?.log?.length}
			<div class="history">
				<div class="title">History</div>
				<div class="scroll">
					{#each $gameStateStore.log as line}
						<div>{line}</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	{#if ($gameStateStore?.winner ?? finalGameResult?.winner ?? null) !== null}
		<div class="notice success" style="margin-top:12px; text-align:center;">
			Winner: {$gameStateStore?.winner ?? finalGameResult?.winner}
		</div>
		<div style="margin-top:8px;text-align:center;">
			<a href="/" class="btn" style="text-decoration:none;">Back to home</a>
		</div>
	{/if}

	<section class="zone player">
		<div class="zone-header">
			<span class="name">👤 {playerA}</span>
			<span class="pill hp">❤️ {hpA}</span>
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
							on:click={(e) => onHandCardClick(e, it.code)}
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
