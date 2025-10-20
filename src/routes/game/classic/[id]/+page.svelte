<script lang="ts">
        import { browser } from '$app/environment';
        import { page as sveltePageStore } from '$app/stores';
        import {
                fetchChronosGameResult,
                fetchChronosGameStateById,
                fetchMultipleChronosCardMetadata,
                playCardInChronosGame,
                skipChronosGameTurn,
                surrenderChronosGame
        } from '$lib/api/GameClient';
        import CardComposite from '$lib/components/CardComposite.svelte';
        import CenterPanel from '$lib/components/CenterPanel.svelte';
        import DeckStack from '$lib/components/DeckStack.svelte';
        import PlayFXOverlay from '$lib/components/PlayFXOverlay.svelte';
        import { fx as visualEffectsStore } from '$lib/stores/fx';
        import { game as gameStateStore, type GameState } from '$lib/stores/game';
        import { onDestroy, onMount } from 'svelte';
        import '../../game.css';

	export const DRAW_TRAVEL_MS = 420;
	export const FLIP_MS = 700;

	type CardDetails = {
		code: string;
		name: string;
		description: string;
		imageUrl: string;
		might: number;
		fire: number;
		magic: number;
		number: number;
	};

        let frameOverlayImageUrl: string | null = '/frames/default.png';
        const titleOverlayImageUrl = '/frames/title.png';
        const cardBackImageUrl = '/frames/card-back.png';

        let errorMessageText: string | null = null;
        let finalGameResult: { winner: string | null; log: string[] } | null = null;

        let authToken: string | null = null;
        let surrendering = false;
        let surrenderError: string | null = null;
        let nowTimestamp = Date.now();
        let timerInterval: number | null = null;
        let handledTurnDeadline: number | null = null;
        let storageListener: ((event: StorageEvent) => void) | null = null;
        let currentTurnDeadline: number | null = null;
        let turnCountdownSeconds: number | null = null;
        let showTurnTimer = false;
        let turnTimerUrgent = false;

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
		number: number;
	};
	let playerHandCardItems: HandCardItem[] = [];
	let pendingCardRevealUidSet = new Set<string>();
	let pendingHiddenUidSet = new Set<string>();
	let autoFlipCycleCounter = 0;

        let fxLayerElement: HTMLDivElement | null = null;
        let playerDeckAnchorElement: HTMLDivElement | null = null;
        let opponentDeckAnchorElement: HTMLDivElement | null = null;

        let hasInitialStateLoaded = false;
        let previousOppHandCount: number | null = null;

        const makeUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

	function reconcile(prev: HandCardItem[], nextCodes: string[]) {
		const buckets = new Map<string, HandCardItem[]>();
		for (const it of prev) {
			const arr = buckets.get(it.code) ?? [];
			arr.push(it);
			buckets.set(it.code, arr);
		}
		const created: string[] = [];
		const items: HandCardItem[] = [];
		for (const code of nextCodes) {
			const q = buckets.get(code);
			if (q && q.length) {
				items.push(q.shift() as HandCardItem);
			} else {
				const uid = makeUid();
				items.push({ code, uid });
				created.push(uid);
			}
		}
		return { items, created };
	}

	let cardDetailsCacheByCode = new Map<string, CardDetails>();
        async function ensureCodesCached(codes: string[]) {
                const missing = codes.filter((code) => !cardDetailsCacheByCode.has(code));
                if (!missing.length) return;
                const chronosCards = await fetchMultipleChronosCardMetadata(missing);
                for (const chronosCard of chronosCards) {
                        cardDetailsCacheByCode.set(chronosCard.code, {
                                code: chronosCard.code,
                                name: chronosCard.name,
                                description: chronosCard.description,
                                imageUrl: chronosCard.image,
                                might: chronosCard.might,
                                fire: chronosCard.fire,
                                magic: chronosCard.magic,
                                number: chronosCard.number
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

	function startDrawFx(fromEl: Element | null, toEl: Element | null, copies: number): number {
		if (!fromEl || !toEl || !fxLayerElement || copies <= 0) return 0;
		const fromRect = fromEl.getBoundingClientRect();
		const toRect = toEl.getBoundingClientRect();
		const fromCx = fromRect.left + fromRect.width / 2;
		const fromCy = fromRect.top + fromRect.height / 2;
		const toCx = toRect.left + toRect.width / 2;
		const toCy = toRect.top + toRect.height / 2;
		const dx = toCx - fromCx;
		const dy = toCy - fromCy;
		for (let i = 0; i < copies; i++) {
			const el = document.createElement('div');
			el.className = 'fx-card';
			el.style.left = `${fromCx - fromRect.width / 2}px`;
			el.style.top = `${fromCy - fromRect.height / 2}px`;
			el.style.width = `${Math.min(fromRect.width, toRect.width)}px`;
			const img = document.createElement('img');
			img.src = cardBackImageUrl;
			img.alt = '';
			el.appendChild(img);
			fxLayerElement.appendChild(el);
			const rotate = (Math.random() * 10 - 5).toFixed(2);
			const anim = el.animate(
				[
					{ transform: 'translate(0px,0px) rotate(0deg)', opacity: 0.9 },
					{ transform: `translate(${dx}px,${dy}px) rotate(${rotate}deg)`, opacity: 0.0 }
				],
				{ duration: DRAW_TRAVEL_MS, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }
			);
			anim.onfinish = () => el.remove();
		}
		return DRAW_TRAVEL_MS;
	}

	function addPendingFlipsFor(uids: string[]) {
		const next = new Set(pendingCardRevealUidSet);
		for (const u of uids) next.add(u);
		pendingCardRevealUidSet = next;
		autoFlipCycleCounter++;
	}

	function clearPendingFlipFor(uid: string) {
		const next = new Set(pendingCardRevealUidSet);
		next.delete(uid);
		pendingCardRevealUidSet = next;
	}

	function hideUids(uids: string[]) {
		const next = new Set(pendingHiddenUidSet);
		for (const u of uids) next.add(u);
		pendingHiddenUidSet = next;
	}

	function unhideUids(uids: string[]) {
		const next = new Set(pendingHiddenUidSet);
		for (const u of uids) next.delete(u);
		pendingHiddenUidSet = next;
	}

	async function loadGameStateOrFinalResult() {
		errorMessageText = null;
		try {
                    const state = (await fetchChronosGameStateById(currentGameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalGameResult = null;
				gameStateStore.set({ ...state, gameId: currentGameId });

				const me = state.players[0];
				const opp = state.players[1] ?? 'playerB';

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

				const newOppCount = Array.isArray(state.hands?.[opp]) ? state.hands[opp].length : 0;

				if (hasInitialStateLoaded) {
					if (created.length) {
						hideUids(created);
						const totalMs = startDrawFx(
							playerDeckAnchorElement,
							myHandContainerElement,
							created.length
						);
						window.setTimeout(() => {
							unhideUids(created);
							addPendingFlipsFor(created);
						}, totalMs);
					}
					if (previousOppHandCount !== null && newOppCount > previousOppHandCount) {
						startDrawFx(
							opponentDeckAnchorElement,
							opponentHandContainerElement,
							newOppCount - previousOppHandCount
						);
					}
				}

				previousOppHandCount = newOppCount;
				hasInitialStateLoaded = true;

				return;
			}
		} catch {}
		try {
                    finalGameResult = await fetchChronosGameResult(currentGameId);
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
            playCardInChronosGame(currentGameId, $gameStateStore!.players[0], code).then(
                    loadGameStateOrFinalResult
            );
	}

        async function skipTurnClassic() {
                if (isGameOver()) return;
                const me = $gameStateStore?.players?.[0] ?? 'playerA';
                await skipChronosGameTurn(currentGameId, me);
                await loadGameStateOrFinalResult();
        }

        async function surrenderCurrentGame() {
                if (isGameOver() || surrendering) return;
                if (!authToken) {
                        surrenderError = 'Login expired. Return to the main page to sign in again.';
                        return;
                }
                surrenderError = null;
                surrendering = true;
                try {
                        await surrenderChronosGame(currentGameId, authToken);
                        await loadGameStateOrFinalResult();
                } catch (error) {
                        surrenderError = (error as Error).message ?? 'Failed to surrender.';
                } finally {
                        surrendering = false;
                }
        }

        onMount(async () => {
                if (browser) {
                        authToken = localStorage.getItem('token');
                        storageListener = (event: StorageEvent) => {
                                if (event.key === 'token') authToken = event.newValue;
                        };
                        window.addEventListener('storage', storageListener);
                        timerInterval = window.setInterval(() => {
                                nowTimestamp = Date.now();
                        }, 500);
                }
                await fetchTemplate();
                await loadGameStateOrFinalResult();
                setupMyHandResizeObserver();
        });

        onDestroy(() => {
                if (timerInterval) window.clearInterval(timerInterval);
                if (browser && storageListener) window.removeEventListener('storage', storageListener);
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
	let opponentHandContainerElement: HTMLDivElement | null = null;
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
        $: currentTurnDeadline =
                typeof $gameStateStore?.turnDeadline === 'number' ? $gameStateStore.turnDeadline : null;
        $: turnCountdownSeconds =
                currentTurnDeadline !== null
                        ? Math.max(0, Math.ceil((currentTurnDeadline - nowTimestamp) / 1000))
                        : null;
        $: showTurnTimer =
                !isGameOver() && turnCountdownSeconds !== null && Number.isFinite(turnCountdownSeconds);
        $: turnTimerUrgent = typeof turnCountdownSeconds === 'number' && turnCountdownSeconds <= 3;
        $: if (
                showTurnTimer &&
                turnCountdownSeconds === 0 &&
                currentTurnDeadline !== null &&
                handledTurnDeadline !== currentTurnDeadline &&
                !isGameOver() &&
                isMyTurn
        ) {
                handledTurnDeadline = currentTurnDeadline;
                void skipTurnClassic().catch((error) => console.error('Auto-skipping turn failed', error));
        }
        $: if (currentTurnDeadline === null) {
                handledTurnDeadline = null;
        } else if (handledTurnDeadline !== null && currentTurnDeadline !== handledTurnDeadline) {
                handledTurnDeadline = null;
        }
</script>

<div class="fixed-top-bar">
        <a href="/" class="home-btn">← Home</a>
        <div class="mode-pill"><strong>Mode:</strong> CLASSIC</div>
        {#if showTurnTimer}
                <div class={`turn-timer-pill${turnTimerUrgent ? ' urgent' : ''}`}>
                        ⏱️ {turnCountdownSeconds}s
                </div>
        {/if}
        {#if !isGameOver()}
                <button
                        class="topbar-button"
                        type="button"
                        on:click={surrenderCurrentGame}
                        disabled={surrendering}
                >
                        {surrendering ? 'Surrendering…' : '🏳️ Surrender'}
                </button>
        {/if}
</div>

<div class="board" style="padding-top:50px;">
        {#if surrenderError}
                <div class="notice error" style="margin:10px auto;max-width:560px;text-align:center;">
                        {surrenderError}
                </div>
        {/if}
        <section class="zone opponent">
                <div class="zone-header">
                        <span class="pill name">👤 {playerB}</span>
                        <span class="pill hp" bind:this={opponentHpPillElement}>❤️ {hpB}</span>
                        <span class="pill deck">🃏 {deckB}</span>
		</div>
		<div class="zone-row two-cols">
			<div class="deck-col" bind:this={opponentDeckAnchorElement}>
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
			<div class="hand opp-hand fan" bind:this={opponentHandContainerElement}>
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
			<span class="pill name">👤 {playerA}</span>
			<span class="pill hp" bind:this={myHpPillElement}>❤️ {hpA}</span>
			<span class="pill deck">🃏 {deckA}</span>
		</div>
		<div class="zone-row two-cols">
			<div class="deck-col" bind:this={playerDeckAnchorElement}>
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
							style={`width:${cardWidthCssValue}; --i:${i}; --n:${playerHandCardItems.length}; ${$gameStateStore?.winner ? 'opacity:.6;cursor:not-allowed;' : ''}${pendingHiddenUidSet.has(it.uid) ? ';visibility:hidden;' : ''}`}
							title={`Play ${it.name ?? it.code}`}
							on:click={(e) => playWithFX(e, it.code)}
						>
							<div class="flip-wrap" data-cycle={autoFlipCycleCounter}>
								<div
									class="flipper"
									class:animate={pendingCardRevealUidSet.has(it.uid)}
									class:start-back={pendingCardRevealUidSet.has(it.uid)}
									on:animationend={() => clearPendingFlipFor(it.uid)}
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
											cornerNumberValue={it.number ?? 0}
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
<div class="fx-layer" bind:this={fxLayerElement}></div>
