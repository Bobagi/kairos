<script lang="ts">
	import { page as sveltePageStore } from '$app/stores';
	import {
		advanceDuel,
		chooseAttributeForDuel,
		chooseCardForDuel,
		getCardMetas,
		getGameResult,
		getGameState,
		unchooseCardForDuel
	} from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game as gameStateStore, type GameState } from '$lib/stores/game';
	import { onDestroy, onMount } from 'svelte';
	import '../../game.css';

	export const REVEAL_PAUSE_MS = 3000;
	export const DRAW_TRAVEL_MS = 420;
	export const FLIP_MS = 500;
	export const LOSER_SHAKE_BEFORE_DISSOLVE_MS = 2000;
	export const DISSOLVE_DURATION_MS = 1800;
	export const REVEAL_EXTRA_BUFFER_MS = 400;

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

	let centerRevealCycle = 0;
	let advanceTimer: number | null = null;

	let fxLayerElement: HTMLDivElement | null = null;
	let playerDeckAnchorElement: HTMLDivElement | null = null;
	let opponentDeckAnchorElement: HTMLDivElement | null = null;
	let opponentHandContainerElement: HTMLDivElement | null = null;
	let centerSlotAElement: HTMLDivElement | null = null;
	let centerSlotBElement: HTMLDivElement | null = null;
	let lastDissolveCycleId: number | null = null;

	let hasInitialStateLoaded = false;
	let previousOppHandCount: number | null = null;

	let historyScrollContainerElement: HTMLDivElement | null = null;
	let lastReturnedCode: string | null = null;
	let lastAppliedLogLength = -1;

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
				items.push({ code, uid, number: 1 });
				created.push(uid);
			}
		}
		return { items, created };
	}

	let cardDetailsCacheByCode = new Map<string, CardDetails>();
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
				magic: m.magic,
				number: m.number
			});
		}
		cardDetailsCacheByCode = new Map(cardDetailsCacheByCode);
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
			const fxCardElement = document.createElement('div');
			fxCardElement.className = 'fx-card';
			fxCardElement.style.left = `${fromCx - fromRect.width / 2}px`;
			fxCardElement.style.top = `${fromCy - fromRect.height / 2}px`;
			fxCardElement.style.width = `${Math.min(fromRect.width, toRect.width)}px`;
			const fxImgElement = document.createElement('img');
			fxImgElement.src = cardBackImageUrl;
			fxImgElement.alt = '';
			fxCardElement.appendChild(fxImgElement);
			fxLayerElement.appendChild(fxCardElement);
			const rotateDeg = (Math.random() * 10 - 5).toFixed(2);
			const animation = fxCardElement.animate(
				[
					{ transform: 'translate(0px,0px) rotate(0deg)', opacity: 0.9 },
					{ transform: `translate(${dx}px,${dy}px) rotate(${rotateDeg}deg)`, opacity: 0.0 }
				],
				{ duration: DRAW_TRAVEL_MS, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }
			);
			animation.onfinish = () => fxCardElement.remove();
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
			const state = (await getGameState(currentGameId)) as GameState | null;
			if (state && typeof state === 'object') {
				finalGameResult = null;
				gameStateStore.set({ ...state, gameId: currentGameId });

				const me = state.players[0];
				const opp = state.players[1] ?? 'playerB';

				const myCodes = Array.isArray(state.hands?.[me]) ? (state.hands[me] as string[]) : [];
				const { items, created } = reconcile(playerHandCardItems, myCodes);
				playerHandCardItems = items;

				let createdFromUnchoose: string[] = [];
				if (lastReturnedCode) {
					createdFromUnchoose = playerHandCardItems
						.filter((it) => it.code === lastReturnedCode && created.includes(it.uid))
						.map((it) => it.uid);
				}
				const createdFromDeck = created.filter((uid) => !createdFromUnchoose.includes(uid));

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
								magic: d.magic,
								number: d.number
							}
						: it;
				});

				const newOppCount = Array.isArray(state.hands?.[opp]) ? state.hands[opp].length : 0;

				if (state.mode === 'ATTRIBUTE_DUEL' && state.duelStage === 'REVEAL') {
					centerRevealCycle++;
					if (advanceTimer) window.clearTimeout(advanceTimer);
					advanceTimer = window.setTimeout(
						async () => {
							try {
								await advanceDuel(currentGameId);
							} finally {
								await loadGameStateOrFinalResult();
							}
						},
						Math.max(
							REVEAL_PAUSE_MS,
							LOSER_SHAKE_BEFORE_DISSOLVE_MS + DISSOLVE_DURATION_MS + REVEAL_EXTRA_BUFFER_MS
						)
					);
				} else if (advanceTimer) {
					window.clearTimeout(advanceTimer);
					advanceTimer = null;
				}

				if (hasInitialStateLoaded) {
					if (createdFromDeck.length) {
						hideUids(createdFromDeck);
						const totalMs = startDrawFx(
							playerDeckAnchorElement,
							myHandContainerElement,
							createdFromDeck.length
						);
						window.setTimeout(() => {
							unhideUids(createdFromDeck);
							addPendingFlipsFor(createdFromDeck);
						}, totalMs);
					}
					if (createdFromUnchoose.length) {
						unhideUids(createdFromUnchoose);
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
				lastReturnedCode = null;
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
		return Boolean(($gameStateStore?.winner ?? finalGameResult?.winner ?? null) !== null);
	}

	async function onHandCardClick(e: MouseEvent, cardCode: string) {
		const state = $gameStateStore;
		if (!state || isGameOver()) return;
		if (state.mode !== 'ATTRIBUTE_DUEL') return;
		if (state.duelCenter?.aCardCode) return;
		if (state.duelStage !== 'PICK_CARD') return;
		const me = state.players[0];
		await chooseCardForDuel(currentGameId, me, cardCode);
		await loadGameStateOrFinalResult();
	}

	async function onCenterCardReturnToHand() {
		const state = $gameStateStore;
		if (!state) return;
		if (state.mode !== 'ATTRIBUTE_DUEL') return;
		if (state.duelStage === 'REVEAL') return;
		if (!state.duelCenter?.aCardCode) return;
		const me = state.players[0];
		lastReturnedCode = state.duelCenter.aCardCode || null;
		await unchooseCardForDuel(currentGameId, me);
		await loadGameStateOrFinalResult();
	}

	async function chooseAttr(attr: 'magic' | 'might' | 'fire') {
		if (isGameOver()) return;
		const me = $gameStateStore?.players?.[0] ?? 'playerA';
		await chooseAttributeForDuel(currentGameId, me, attr);
		await loadGameStateOrFinalResult();
	}

	function detectChosenAttributeMode(center: any): 'fire' | 'magic' | 'might' {
		const raw = (
			center?.chosenAttr ??
			center?.attribute ??
			center?.attr ??
			center?.chosenAttribute ??
			center?.attributeName ??
			''
		)
			.toString()
			.toLowerCase();
		if (raw.includes('mag')) return 'magic';
		if (raw.includes('fire')) return 'fire';
		if (
			raw.includes('might') ||
			raw.includes('strength') ||
			raw.includes('power') ||
			raw.includes('forc')
		)
			return 'might';
		return 'fire';
	}

	function startEdgeInwardDissolveOnElement(
		targetEl: HTMLElement,
		mode: 'fire' | 'magic' | 'might',
		durationMs: number = DISSOLVE_DURATION_MS
	) {
		const rect = targetEl.getBoundingClientRect();
		const deviceScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		const canvasWidth = Math.max(2, Math.round(rect.width * deviceScale));
		const canvasHeight = Math.max(2, Math.round(rect.height * deviceScale));
		const overlayCanvas = document.createElement('canvas');
		overlayCanvas.width = canvasWidth;
		overlayCanvas.height = canvasHeight;
		overlayCanvas.style.position = 'absolute';
		overlayCanvas.style.inset = '0';
		overlayCanvas.style.pointerEvents = 'none';
		overlayCanvas.style.borderRadius = getComputedStyle(targetEl).borderRadius || '10px';
		targetEl.appendChild(overlayCanvas);
		const overlayCtx = overlayCanvas.getContext('2d', { willReadFrequently: true })!;
		const maskCanvas = document.createElement('canvas');
		maskCanvas.width = canvasWidth;
		maskCanvas.height = canvasHeight;
		const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
		targetEl.style.webkitMaskSize = '100% 100%';
		targetEl.style.maskSize = '100% 100%';

		function seedRandom(seed: number) {
			let t = seed >>> 0;
			return function () {
				t += 0x6d2b79f5;
				let x = Math.imul(t ^ (t >>> 15), 1 | t);
				x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
				return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
			};
		}
		function createOctaveNoise(width: number, height: number, seed: number) {
			const rand = seedRandom(seed);
			const data = new Float32Array(width * height);
			for (let i = 0; i < data.length; i++) data[i] = rand();
			return { width, height, data };
		}
		function sampleBilinear(
			oct: { width: number; height: number; data: Float32Array },
			u: number,
			v: number
		) {
			const x = (((u % 1) + 1) % 1) * (oct.width - 1);
			const y = (((v % 1) + 1) % 1) * (oct.height - 1);
			const x0 = Math.floor(x),
				y0 = Math.floor(y);
			const x1 = Math.min(x0 + 1, oct.width - 1),
				y1 = Math.min(y0 + 1, oct.height - 1);
			const tx = x - x0,
				ty = y - y0;
			const i00 = y0 * oct.width + x0;
			const i10 = y0 * oct.width + x1;
			const i01 = y1 * oct.width + x0;
			const i11 = y1 * oct.width + x1;
			const a = oct.data[i00] * (1 - tx) + oct.data[i10] * tx;
			const b = oct.data[i01] * (1 - tx) + oct.data[i11] * tx;
			return a * (1 - ty) + b * ty;
		}
		const noiseOctaves = [
			createOctaveNoise(96, 96, 101),
			createOctaveNoise(192, 192, 202),
			createOctaveNoise(384, 384, 303)
		];
		function sampleFractal(u: number, v: number, t: number) {
			const o0 = sampleBilinear(noiseOctaves[0], u + t * 0.03, v - t * 0.12);
			const o1 = sampleBilinear(noiseOctaves[1], u * 2 - t * 0.03, v * 2 - t * 0.18);
			const o2 = sampleBilinear(noiseOctaves[2], u * 4 + t * 0.02, v * 4 - t * 0.26);
			return o0 * 0.6 + o1 * 0.3 + o2 * 0.1 - 0.5;
		}
		function clamp(v: number, a: number, b: number) {
			return v < a ? a : v > b ? b : v;
		}
		function palette(mode: 'fire' | 'magic' | 'might', t: number): [number, number, number] {
			if (mode === 'fire') {
				const r = 255;
				const g = Math.round(64 + (240 - 64) * t);
				const b = Math.round(0 + (80 - 0) * t);
				return [r, g, b];
			}
			if (mode === 'magic') {
				const r = Math.round(40 + (120 - 40) * t);
				const g = Math.round(80 + (200 - 80) * t);
				const b = Math.round(160 + (255 - 160) * t);
				return [r, g, b];
			}
			const r = Math.round(120 + (200 - 120) * t);
			const g = Math.round(72 + (140 - 72) * t);
			const b = Math.round(32 + (80 - 32) * t);
			return [r, g, b];
		}

		const maxEdgeDistance = Math.min(canvasWidth, canvasHeight) * 0.5;
		const fireBandBaseWidth = 0.14;
		const fireNoiseStrength = 0.33;
		const innerFizzleWidth = 0.18;
		const ovalShapeMix = 0.6;
		const ovalVerticalScale = 0.85;
		let startTimestamp = 0;

		function drawFrame(timestampMs: number) {
			if (!startTimestamp) startTimestamp = timestampMs;
			const elapsedMs = timestampMs - startTimestamp;
			const tSec = elapsedMs / 1000;
			const normalized = clamp(elapsedMs / durationMs, 0, 1);
			const boostedProgress = normalized;
			const overlayImage = overlayCtx.createImageData(canvasWidth, canvasHeight);
			const overlayData = overlayImage.data;
			const maskImage = maskCtx.createImageData(canvasWidth, canvasHeight);
			const maskData = maskImage.data;
			const centerX = canvasWidth * 0.5;
			const centerY = canvasHeight * 0.5;
			for (let y = 0; y < canvasHeight; y++) {
				for (let x = 0; x < canvasWidth; x++) {
					const di = (y * canvasWidth + x) * 4;
					const dxToEdge = Math.min(x, canvasWidth - 1 - x);
					const dyToEdge = Math.min(y, canvasHeight - 1 - y);
					const rectDistance = Math.min(dxToEdge, dyToEdge);
					const rectNorm = clamp(rectDistance / maxEdgeDistance, 0, 1);
					const rx = (x - centerX) / (canvasWidth * 0.5);
					const ry = (y - centerY) / (canvasHeight * 0.5);
					const ellipseNorm = clamp(
						1 - Math.sqrt(rx * rx + ry * ry * ovalVerticalScale * ovalVerticalScale),
						0,
						1
					);
					const edgeNormalized = rectNorm * (1 - ovalShapeMix) + ellipseNorm * ovalShapeMix;
					const u = x / canvasWidth;
					const v = y / canvasHeight;
					const n = sampleFractal(u, v, tSec);
					const maskValue = edgeNormalized + n * fireNoiseStrength;
					const localBand = fireBandBaseWidth * (0.7 + 0.6 * (n + 0.5));
					const delta = Math.abs(maskValue - boostedProgress);
					const insideDepth = maskValue - boostedProgress;
					let maskA = 0;
					if (insideDepth > 0) {
						const insideT = clamp(insideDepth / innerFizzleWidth, 0, 1);
						maskA = Math.round(255 * insideT);
					} else if (delta < localBand * 1.3) {
						const edgeT = 1 - delta / (localBand * 1.3);
						maskA = Math.round(255 * edgeT);
					}
					maskData[di] = 255;
					maskData[di + 1] = 255;
					maskData[di + 2] = 255;
					maskData[di + 3] = maskA;
					if (delta < localBand * 1.3) {
						const te = 1 - delta / (localBand * 1.3);
						const [fr, fg, fb] = palette(mode, te);
						overlayData[di] = fr;
						overlayData[di + 1] = fg;
						overlayData[di + 2] = fb;
						overlayData[di + 3] = Math.round(255 * te);
					} else {
						overlayData[di] = 0;
						overlayData[di + 1] = 0;
						overlayData[di + 2] = 0;
						overlayData[di + 3] = 0;
					}
				}
			}
			overlayCtx.putImageData(overlayImage, 0, 0);
			maskCtx.putImageData(maskImage, 0, 0);
			const dataUrl = maskCanvas.toDataURL('image/png');
			targetEl.style.webkitMaskImage = `url(${dataUrl})`;
			targetEl.style.maskImage = `url(${dataUrl})`;
			if (normalized < 1) {
				requestAnimationFrame(drawFrame);
			} else {
				targetEl.style.opacity = '0';
				targetEl.style.pointerEvents = 'none';
				targetEl.style.webkitMaskImage = 'none';
				targetEl.style.maskImage = 'none';
				overlayCanvas.remove();
			}
		}
		requestAnimationFrame(drawFrame);
	}

	function findLoserCenterElement(): HTMLElement | null {
		const winner = ($gameStateStore?.duelCenter as any)?.roundWinner;
		if (!winner) return null;
		if (winner === playerA) return centerSlotBElement;
		if (winner === playerB) return centerSlotAElement;
		return null;
	}

	onMount(async () => {
		await loadGameStateOrFinalResult();
		setupMyHandResizeObserver();
	});

	onDestroy(() => {
		if (advanceTimer) window.clearTimeout(advanceTimer);
	});

	$: playerA = $gameStateStore?.players?.[0] ?? 'playerA';
	$: playerB = $gameStateStore?.players?.[1] ?? 'playerB';
	$: playerAUsername = $gameStateStore?.playerUsernames?.[playerA] ?? playerA;
	$: playerBUsername = $gameStateStore?.playerUsernames?.[playerB] ?? playerB;
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

	$: canReturnSelectedCardToHand =
		!($gameStateStore?.winner ?? finalGameResult?.winner ?? null) &&
		$gameStateStore?.mode === 'ATTRIBUTE_DUEL' &&
		Boolean($gameStateStore?.duelCenter?.aCardCode) &&
		$gameStateStore?.duelStage !== 'REVEAL' &&
		($gameStateStore?.players?.[0] ?? '') === chooserId;

	$: historyLogLength = $gameStateStore?.log?.length ?? 0;
	$: if (historyScrollContainerElement && historyLogLength > lastAppliedLogLength) {
		lastAppliedLogLength = historyLogLength;
		requestAnimationFrame(() => {
			if (historyScrollContainerElement) {
				historyScrollContainerElement.scrollTop = historyScrollContainerElement.scrollHeight;
			}
		});
	}

	$: {
		if (
			duelStage === 'REVEAL' &&
			($gameStateStore?.duelCenter as any)?.roundWinner &&
			centerRevealCycle !== null &&
			centerRevealCycle !== lastDissolveCycleId
		) {
			const loserEl = findLoserCenterElement();
			const mode = detectChosenAttributeMode($gameStateStore?.duelCenter);
			lastDissolveCycleId = centerRevealCycle;
			if (loserEl) {
				window.setTimeout(() => {
					(loserEl as HTMLElement).style.animation = 'none';
					startEdgeInwardDissolveOnElement(loserEl as HTMLElement, mode, DISSOLVE_DURATION_MS);
				}, LOSER_SHAKE_BEFORE_DISSOLVE_MS);
			}
		}
	}

	$: resolvedWinner = $gameStateStore?.winner ?? finalGameResult?.winner ?? null;
</script>

<svelte:head>
	<title>Duel – Chronos</title>
</svelte:head>

<div class="fixed-top-bar">
	<a href="/" class="home-btn">← Home</a>
	<div class="mode-pill"><strong>Mode:</strong> ATTRIBUTE_DUEL</div>
</div>

<div class="board" style="padding-top:50px;">
	<section class="zone opponent">
		<div class="zone-header">
			<span class="pill name">👤 {playerBUsername}</span>
			<span class="pill hp">❤️ {hpB}</span>
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

	<section class="zone center" style="margin:10px auto; max-width:1200px;">
		<div class="center-content">
			<div class="center-left">
				<div
					class="zone-row two-cols"
					style="gap:24px; align-items:center; justify-content:center; grid-template-columns:auto auto;"
				>
					<div
						class="duel-slot"
						class:slot-removable={canReturnSelectedCardToHand}
						style={`width:${cardWidthCssValue}; height:calc(${cardWidthCssValue} * 1.55);`}
					>
						{#if $gameStateStore?.duelCenter?.aCardCode}
							<div
								bind:this={centerSlotAElement}
								class={`result-wrap ${$gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner === playerA ? 'winner-glow' : $gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner && ($gameStateStore?.duelCenter as any)?.roundWinner !== playerA ? 'loser-shake' : ''}`}
								on:click={onCenterCardReturnToHand}
								title="Return card to hand"
							>
								<CardComposite
									artImageUrl={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.imageUrl ?? ''}
									frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
									titleImageUrl={titleOverlayImageUrl}
									titleText={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.name ?? $gameStateStore.duelCenter.aCardCode}
									aspectWidth={430}
									aspectHeight={670}
									artObjectFit="cover"
									enableTilt={false}
									descriptionText={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.description ?? ''}
									magicValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.magic ?? 0}
									mightValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.might ?? 0}
									fireValue={cardDetailsCacheByCode.get($gameStateStore.duelCenter.aCardCode)
										?.fire ?? 0}
									cornerNumberValue={cardDetailsCacheByCode.get(
										$gameStateStore.duelCenter.aCardCode
									)?.number ?? 0}
								/>
							</div>
						{:else}
							<div class="slot-empty">
								<span class="slot-icon">🃏</span>
							</div>
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
											bind:this={centerSlotBElement}
											class={`result-wrap ${$gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner === playerB ? 'winner-glow' : $gameStateStore?.duelStage === 'REVEAL' && ($gameStateStore?.duelCenter as any)?.roundWinner && ($gameStateStore?.duelCenter as any)?.roundWinner !== playerB ? 'loser-shake' : ''}`}
										>
											<CardComposite
												artImageUrl={cardDetailsCacheByCode.get(
													$gameStateStore.duelCenter.bCardCode
												)?.imageUrl ?? ''}
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
							<div class="slot-empty slot-empty-opp">
								<span class="slot-icon">⚔️</span>
							</div>
						{/if}
					</div>
				</div>

				{#if duelStage === 'PICK_ATTRIBUTE' && chooserId === playerA}
					<div class="notice chooser" style="margin-top:12px; text-align:center;">
						<span>Choose attribute:</span>
						<div>
							<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('magic')}>
								<img src="/icons/magic_icon.png" alt="Magic icon" />
							</button>
							<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('might')}>
								<img src="/icons/strength_icon.png" alt="Might icon" />
							</button>
							<button class="btn" disabled={isGameOver()} on:click={() => chooseAttr('fire')}>
								<img src="/icons/fire_icon.png" alt="Fire icon" />
							</button>
						</div>
					</div>
				{:else if duelStage === 'PICK_ATTRIBUTE'}
					<div class="notice warn" style="margin-top:12px; text-align:center;">
						Waiting for {chooserId} to choose the attribute…
					</div>
				{/if}

				{#if duelStage === 'REVEAL' && !($gameStateStore?.duelCenter as any)?.roundWinner}
					<div class="notice info" style="margin-top:12px; text-align:center;">
						Rodada empatada!
					</div>
				{/if}
			</div>

			<div class="center-right">
				<div class="zone-header">
					<span class="pill name">⚔️ Attribute Duel</span>
					{#if discardPiles}
						<span class="pill">{playerAUsername} pile: {(discardPiles[playerA] ?? []).length}</span>
						<span class="pill">{playerBUsername} pile: {(discardPiles[playerB] ?? []).length}</span>
					{/if}
				</div>

				{#if $gameStateStore?.log?.length}
					<div class="history">
						<div class="title">History</div>
						<div
							class="scroll"
							style="flex-direction: column;"
							bind:this={historyScrollContainerElement}
						>
							{#each $gameStateStore.log as line}
								<div>{line}</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</section>

	{#if resolvedWinner !== null}
		<div class="notice success" style="margin-top:12px; text-align:center;">
			{resolvedWinner === 'DRAW' ? 'Partida empatada' : `Winner: ${resolvedWinner}`}
		</div>
		<div style="margin-top:8px;text-align:center;">
			<a href="/" class="btn" style="text-decoration:none;">Back to home</a>
		</div>
	{/if}

	<section class="zone player">
		<div class="zone-header">
			<span class="pill name">👤 {playerAUsername}</span>
			<span class="pill hp">❤️ {hpA}</span>
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
							on:click={(e) => onHandCardClick(e, it.code)}
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
											src="/frames/card-back.png"
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

<div class="fx-layer" bind:this={fxLayerElement}></div>
