<script lang="ts">
	import { page as sveltePageStore } from '$app/stores';
        import type { ChronosCardCatalogItem } from '$lib/api/GameClient';
        import {
                advanceChronosDuel,
                chooseChronosDuelAttribute,
                chooseChronosDuelCard,
                fetchChronosCardCatalog,
                fetchChronosGameResult,
                fetchChronosGameStateById,
                fetchMultipleChronosCardMetadata,
                unchooseChronosDuelCard
        } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import DeckStack from '$lib/components/DeckStack.svelte';
	import { game as gameStateStore, type GameState } from '$lib/stores/game';
	import { onDestroy, onMount } from 'svelte';
	import '../../game.css';

	export const REVEAL_PAUSE_MS = 3000;
	export const DRAW_TRAVEL_MS = 420;
	export const FLIP_MS = 500;
        export const LOSER_SHAKE_BEFORE_DEFEAT_EFFECT_MS = 2000;
        export const DEFEAT_EFFECT_DURATION_MS = 2200;
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
        $: currentDuelCenter = $gameStateStore?.duelCenter ?? null;
        $: currentDuelStage = $gameStateStore?.duelStage ?? null;
        $: currentDuelRoundWinner = currentDuelCenter?.roundWinner ?? null;
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
        let lastDefeatEffectCycleId: number | null = null;

        let hasInitialStateLoaded = false;
        let previousOppHandCount: number | null = null;

        let playerA: string = 'playerA';
        let playerB: string = 'playerB';
        let playerAUsername: string = 'playerA';
        let playerBUsername: string = 'playerB';

        let historyScrollContainerElement: HTMLDivElement | null = null;
        let lastReturnedCode: string | null = null;
        let lastAppliedLogLength = -1;

        type LogCategory = 'player' | 'opponent' | 'neutral';

        function getLogPresentation(line: string): {
                category: LogCategory;
                icon: string;
                text: string;
        } {
                const safeLine = line ?? '';
                const normalizedLine = safeLine.toLowerCase();
                const normalizedPlayer = (playerAUsername ?? '').toLowerCase();
                const normalizedOpponent = (playerBUsername ?? '').toLowerCase();

                if (normalizedPlayer && normalizedLine.includes(normalizedPlayer)) {
                        return { category: 'player', icon: '🛡️', text: safeLine };
                }
                if (normalizedOpponent && normalizedLine.includes(normalizedOpponent)) {
                        return { category: 'opponent', icon: '⚔️', text: safeLine };
                }
                return { category: 'neutral', icon: '✨', text: safeLine };
        }

        function isHighlightedAttribute(attr: 'magic' | 'might' | 'fire'): boolean {
                if (!chooserCardDetails) return false;
                const stats = {
                        magic: chooserCardDetails.magic ?? 0,
                        might: chooserCardDetails.might ?? 0,
                        fire: chooserCardDetails.fire ?? 0
                };
                const highest = Math.max(stats.magic, stats.might, stats.fire);
                return stats[attr] === highest && highest > 0;
        }

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
        let catalogNumberByCode = new Map<string, number>();
        let catalogLoaded = false;
        let chooserCardDetails: CardDetails | null = null;

        async function ensureCatalogLoaded() {
                if (catalogLoaded) return;
                try {
                        const catalogEntries = await fetchChronosCardCatalog();
                        for (const catalogEntry of catalogEntries) {
                                catalogNumberByCode.set(catalogEntry.code, catalogEntry.number);
                        }
                } finally {
                        catalogLoaded = true;
                }
        }

        async function ensureCodesCached(codes: string[]) {
                const missingCodes = codes.filter((code) => {
                        const cachedCard = cardDetailsCacheByCode.get(code);
                        return !cachedCard || Number.isNaN(cachedCard.number);
                });
                if (!missingCodes.length) return;

                await ensureCatalogLoaded();

                const chronosCards = await fetchMultipleChronosCardMetadata(missingCodes);
                for (const chronosCard of chronosCards) {
                        const resolvedNumber =
                                chronosCard.number || catalogNumberByCode.get(chronosCard.code) || 0;
                        cardDetailsCacheByCode.set(chronosCard.code, {
                                code: chronosCard.code,
                                name: chronosCard.name,
                                description: chronosCard.description,
                                imageUrl: chronosCard.image,
                                might: chronosCard.might,
                                fire: chronosCard.fire,
                                magic: chronosCard.magic,
                                number: resolvedNumber
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
			const state = (await fetchChronosGameStateById(currentGameId)) as GameState | null;
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
								await advanceChronosDuel(currentGameId);
							} finally {
								await loadGameStateOrFinalResult();
							}
						},
                                                Math.max(
                                                        REVEAL_PAUSE_MS,
                                                        LOSER_SHAKE_BEFORE_DEFEAT_EFFECT_MS +
                                                                DEFEAT_EFFECT_DURATION_MS +
                                                                REVEAL_EXTRA_BUFFER_MS
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
			finalGameResult = await fetchChronosGameResult(currentGameId);
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
		await chooseChronosDuelCard(currentGameId, me, cardCode);
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
		await unchooseChronosDuelCard(currentGameId, me);
		await loadGameStateOrFinalResult();
	}

	async function chooseAttr(attr: 'magic' | 'might' | 'fire') {
		if (isGameOver()) return;
		const me = $gameStateStore?.players?.[0] ?? 'playerA';
		await chooseChronosDuelAttribute(currentGameId, me, attr);
		await loadGameStateOrFinalResult();
	}

        function detectChosenAttributeMode(
                center: GameState['duelCenter'] | null | undefined
        ): 'fire' | 'magic' | 'might' {
                const rawAttributeText = (
                        center?.chosenAttribute ??
                        center?.attribute ??
                        center?.attributeName ??
                        center?.attr ??
                        center?.chosenAttr ??
                        ''
                )
                        .toString()
                        .toLowerCase();
                if (rawAttributeText.includes('mag')) return 'magic';
                if (rawAttributeText.includes('fire')) return 'fire';
                if (
                        rawAttributeText.includes('might') ||
                        rawAttributeText.includes('strength') ||
                        rawAttributeText.includes('power') ||
                        rawAttributeText.includes('forc')
                ) {
                        return 'might';
                }
                return 'fire';
        }

        type FireDefeatParticle = {
                type: 'fire';
                px: number;
                py: number;
                vx: number;
                vy: number;
                life: number;
                maxLife: number;
                size: number;
                flickerSpeed: number;
        };

        type MagicDefeatParticle = {
                type: 'magic';
                angle: number;
                radius: number;
                angularVelocity: number;
                radiusVelocity: number;
                px: number;
                py: number;
                life: number;
                maxLife: number;
                size: number;
        };

        type MightDefeatParticle = {
                type: 'might';
                px: number;
                py: number;
                vx: number;
                vy: number;
                rotation: number;
                rotationVelocity: number;
                life: number;
                maxLife: number;
                width: number;
                height: number;
        };

        type DefeatParticle = FireDefeatParticle | MagicDefeatParticle | MightDefeatParticle;

        function startAttributeThemedDefeatAnimationOnElement(
                targetEl: HTMLElement,
                mode: 'fire' | 'magic' | 'might',
                durationMs: number = DEFEAT_EFFECT_DURATION_MS
        ) {
                if (!targetEl || targetEl.dataset.defeatEffectActive === '1') {
                        return;
                }
                const boundingRect = targetEl.getBoundingClientRect();
                const deviceScale = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));
                const canvasWidth = Math.max(2, Math.round(boundingRect.width * deviceScale));
                const canvasHeight = Math.max(2, Math.round(boundingRect.height * deviceScale));
                const overlayCanvas = document.createElement('canvas');
                overlayCanvas.width = canvasWidth;
                overlayCanvas.height = canvasHeight;
                overlayCanvas.style.position = 'absolute';
                overlayCanvas.style.inset = '0';
                overlayCanvas.style.width = '100%';
                overlayCanvas.style.height = '100%';
                overlayCanvas.style.pointerEvents = 'none';
                overlayCanvas.style.borderRadius = getComputedStyle(targetEl).borderRadius || '10px';
                overlayCanvas.style.mixBlendMode = mode === 'might' ? 'hard-light' : 'screen';
                const overlayCtx = overlayCanvas.getContext('2d');
                if (!overlayCtx) return;

                const originalPositionStyle = targetEl.style.position;
                const computedPosition = getComputedStyle(targetEl).position;
                if (!computedPosition || computedPosition === 'static') {
                        targetEl.style.position = 'relative';
                }

                targetEl.dataset.defeatEffectActive = '1';
                targetEl.classList.add('defeat-active', `defeat-${mode}`);
                targetEl.appendChild(overlayCanvas);

                const particleCount = Math.min(220, Math.max(90, Math.round((canvasWidth * canvasHeight) / 1100)));
                const particles: DefeatParticle[] = [];

                const spawnFireParticle = (): FireDefeatParticle => ({
                        type: 'fire',
                        px: Math.random(),
                        py: 0.55 + Math.random() * 0.4,
                        vx: (Math.random() - 0.5) * 0.18,
                        vy: -0.45 - Math.random() * 0.35,
                        life: 0,
                        maxLife: 0.7 + Math.random() * 0.9,
                        size: 0.05 + Math.random() * 0.09,
                        flickerSpeed: 6 + Math.random() * 6
                });

                const spawnMagicParticle = (): MagicDefeatParticle => {
                        const baseRadius = 0.06 + Math.random() * 0.32;
                        return {
                                type: 'magic',
                                angle: Math.random() * Math.PI * 2,
                                radius: baseRadius,
                                angularVelocity: (Math.random() * 1.6 + 0.7) * (Math.random() > 0.5 ? 1 : -1),
                                radiusVelocity: 0.18 + Math.random() * 0.25,
                                px: 0.5,
                                py: 0.5,
                                life: 0,
                                maxLife: 1.2 + Math.random() * 1.1,
                                size: 0.05 + Math.random() * 0.08
                        };
                };

                const spawnMightParticle = (): MightDefeatParticle => ({
                        type: 'might',
                        px: 0.25 + Math.random() * 0.5,
                        py: 0.2 + Math.random() * 0.4,
                        vx: (Math.random() - 0.5) * 0.75,
                        vy: 0.55 + Math.random() * 0.65,
                        rotation: (Math.random() - 0.5) * 0.6,
                        rotationVelocity: (Math.random() - 0.5) * 5,
                        life: 0,
                        maxLife: 0.9 + Math.random() * 1.1,
                        width: 0.05 + Math.random() * 0.12,
                        height: 0.12 + Math.random() * 0.22
                });

                const buildParticle = (): DefeatParticle => {
                        if (mode === 'fire') return spawnFireParticle();
                        if (mode === 'magic') return spawnMagicParticle();
                        return spawnMightParticle();
                };

                for (let i = 0; i < particleCount; i++) {
                        particles.push(buildParticle());
                }

                const rotationTarget = mode === 'might' ? -8 : mode === 'magic' ? 4 : 9;
                const translationTarget = mode === 'might' ? 18 : 12;
                const scaleTarget = mode === 'might' ? 0.82 : 0.78;

                let cleanedUp = false;
                const fadeAnimation = targetEl.animate(
                        [
                                {
                                        transform: 'translateZ(0) scale(1)',
                                        filter: 'saturate(1) brightness(1)',
                                        opacity: 1
                                },
                                {
                                        transform: 'translateZ(0) translateY(6px) scale(0.94)',
                                        filter: 'saturate(0.7) brightness(0.85)',
                                        opacity: 0.68
                                },
                                {
                                        transform: `translateZ(0) translateY(${translationTarget}px) rotate(${rotationTarget}deg) scale(${scaleTarget})`,
                                        filter: 'saturate(0.2) brightness(0.55) blur(2px)',
                                        opacity: 0
                                }
                        ],
                        { duration: durationMs, easing: 'ease-in', fill: 'forwards' }
                );

                const startTimestamp = performance.now();
                let lastTimestamp = startTimestamp;

                const drawFrame = (timestamp: number) => {
                        const elapsedMs = timestamp - startTimestamp;
                        const deltaSeconds = Math.max(0.001, (timestamp - lastTimestamp) / 1000);
                        lastTimestamp = timestamp;
                        const normalized = Math.min(1, elapsedMs / durationMs);

                        overlayCtx.globalCompositeOperation = 'source-over';
                        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
                        overlayCtx.globalCompositeOperation = mode === 'might' ? 'source-over' : 'lighter';

                        const centerX = 0.5;
                        const centerY = 0.5;

                        for (let i = 0; i < particles.length; i++) {
                                const particle = particles[i];
                                const lifeRatio = Math.min(1, particle.life / particle.maxLife);
                                const remaining = 1 - lifeRatio;

                                if (particle.type === 'fire') {
                                        particle.life += deltaSeconds * (1.1 + normalized * 0.6);
                                        particle.px += particle.vx * deltaSeconds;
                                        particle.py += particle.vy * deltaSeconds * (0.9 + normalized * 0.7);
                                        if (particle.py < -0.1 || particle.life >= particle.maxLife) {
                                                particles[i] = spawnFireParticle();
                                                continue;
                                        }
                                        const px = particle.px * canvasWidth;
                                        const py = particle.py * canvasHeight;
                                        const sizePx = particle.size * canvasWidth;
                                        const flicker = 0.6 + Math.sin(timestamp / 1000 * particle.flickerSpeed) * 0.3;
                                        const alpha = Math.min(1, remaining * 1.1) * 0.9 * flicker;
                                        const gradient = overlayCtx.createRadialGradient(px, py, sizePx * 0.2, px, py, sizePx);
                                        gradient.addColorStop(0, `rgba(255, 230, 160, ${alpha})`);
                                        gradient.addColorStop(0.45, `rgba(255, 120, 40, ${alpha * 0.85})`);
                                        gradient.addColorStop(1, 'rgba(70, 18, 0, 0)');
                                        overlayCtx.fillStyle = gradient;
                                        overlayCtx.fillRect(px - sizePx, py - sizePx, sizePx * 2, sizePx * 2);
                                        continue;
                                }

                                if (particle.type === 'magic') {
                                        particle.life += deltaSeconds;
                                        particle.radius += particle.radiusVelocity * deltaSeconds * (0.9 + normalized * 0.4);
                                        particle.angle += particle.angularVelocity * deltaSeconds;
                                        const spiralLift = 0.04 + normalized * 0.08;
                                        particle.py = centerY + Math.sin(particle.angle) * particle.radius * 0.7 - normalized * spiralLift;
                                        particle.px = centerX + Math.cos(particle.angle) * particle.radius * 0.9;
                                        if (particle.life >= particle.maxLife) {
                                                particles[i] = spawnMagicParticle();
                                                continue;
                                        }
                                        const px = particle.px * canvasWidth;
                                        const py = particle.py * canvasHeight;
                                        const sizePx = particle.size * canvasWidth;
                                        const alpha = Math.min(1, remaining * 1.15);
                                        const gradient = overlayCtx.createRadialGradient(px, py, sizePx * 0.2, px, py, sizePx);
                                        gradient.addColorStop(0, `rgba(210, 240, 255, ${alpha})`);
                                        gradient.addColorStop(0.5, `rgba(120, 150, 255, ${alpha * 0.7})`);
                                        gradient.addColorStop(1, 'rgba(30, 0, 80, 0)');
                                        overlayCtx.fillStyle = gradient;
                                        overlayCtx.fillRect(px - sizePx, py - sizePx, sizePx * 2, sizePx * 2);
                                        continue;
                                }

                                particle.life += deltaSeconds * (0.9 + normalized * 0.5);
                                particle.vy += 1.4 * deltaSeconds;
                                particle.px += particle.vx * deltaSeconds;
                                particle.py += particle.vy * deltaSeconds;
                                particle.rotation += particle.rotationVelocity * deltaSeconds;
                                const offscreen =
                                        particle.py > 1.2 || particle.px < -0.2 || particle.px > 1.2 || particle.life >= particle.maxLife;
                                if (offscreen) {
                                        particles[i] = spawnMightParticle();
                                        continue;
                                }
                                const px = particle.px * canvasWidth;
                                const py = particle.py * canvasHeight;
                                const widthPx = particle.width * canvasWidth;
                                const heightPx = particle.height * canvasHeight;
                                const alpha = Math.min(1, remaining * 1.05);
                                overlayCtx.save();
                                overlayCtx.translate(px, py);
                                overlayCtx.rotate(particle.rotation);
                                overlayCtx.fillStyle = `rgba(200, 160, 110, ${alpha})`;
                                overlayCtx.fillRect(-widthPx * 0.5, -heightPx * 0.5, widthPx, heightPx);
                                overlayCtx.fillStyle = `rgba(120, 70, 30, ${alpha * 0.8})`;
                                overlayCtx.fillRect(-widthPx * 0.5, -heightPx * 0.15, widthPx, heightPx * 0.3);
                                overlayCtx.restore();
                        }

                        if (normalized < 1) {
                                requestAnimationFrame(drawFrame);
                        } else {
                                cleanup();
                        }
                };

                const cleanup = () => {
                        if (cleanedUp) return;
                        cleanedUp = true;
                        if (typeof fadeAnimation.commitStyles === 'function') {
                                fadeAnimation.commitStyles();
                        }
                        fadeAnimation.cancel();
                        targetEl.style.opacity = '0';
                        targetEl.style.transform = `translateZ(0) translateY(${translationTarget}px) scale(${scaleTarget})`;
                        targetEl.style.filter = 'saturate(0.15) brightness(0.4) blur(2px)';
                        targetEl.style.pointerEvents = 'none';
                        targetEl.classList.remove('defeat-active', `defeat-${mode}`);
                        delete targetEl.dataset.defeatEffectActive;
                        overlayCanvas.remove();
                        fadeAnimation.removeEventListener('finish', cleanup);
                        if (!originalPositionStyle && computedPosition === 'static') {
                                targetEl.style.position = '';
                        } else {
                                targetEl.style.position = originalPositionStyle;
                        }
                };

                fadeAnimation.addEventListener('finish', cleanup);

                requestAnimationFrame(drawFrame);
        }

        function findLoserCenterElement(): HTMLElement | null {
                const winner = currentDuelRoundWinner;
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
	$: duelStage = currentDuelStage ?? null;
	$: duelCenter = currentDuelCenter ?? null;
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
                Boolean(currentDuelCenter?.aCardCode) &&
                currentDuelStage !== 'REVEAL' &&
                ($gameStateStore?.players?.[0] ?? '') === chooserId;

        $: chooserCardDetails =
                duelStage === 'PICK_ATTRIBUTE' &&
                chooserId === playerA &&
                currentDuelCenter?.aCardCode
                        ? cardDetailsCacheByCode.get(currentDuelCenter.aCardCode) ?? null
                        : null;

        $: historyLogLength = $gameStateStore?.log?.length ?? 0;
        $: {
                if (historyLogLength < lastAppliedLogLength) {
                        lastAppliedLogLength = historyLogLength;
                }
                if (historyScrollContainerElement && historyLogLength > lastAppliedLogLength) {
                        lastAppliedLogLength = historyLogLength;
                        requestAnimationFrame(() => {
                                if (historyScrollContainerElement) {
                                        historyScrollContainerElement.scrollTop = historyScrollContainerElement.scrollHeight;
                                }
                        });
                }
        }

	$: {
		if (
			duelStage === 'REVEAL' &&
			currentDuelRoundWinner &&
			centerRevealCycle !== null &&
                        centerRevealCycle !== lastDefeatEffectCycleId
                ) {
                        const loserEl = findLoserCenterElement();
                        const mode = detectChosenAttributeMode(currentDuelCenter);
                        lastDefeatEffectCycleId = centerRevealCycle;
                        if (loserEl) {
                                window.setTimeout(() => {
                                        (loserEl as HTMLElement).style.animation = 'none';
                                        startAttributeThemedDefeatAnimationOnElement(
                                                loserEl as HTMLElement,
                                                mode,
                                                DEFEAT_EFFECT_DURATION_MS
                                        );
                                }, LOSER_SHAKE_BEFORE_DEFEAT_EFFECT_MS);
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
						{#if currentDuelCenter?.aCardCode}
							<div
								bind:this={centerSlotAElement}
								class={`result-wrap ${currentDuelStage === 'REVEAL' && currentDuelRoundWinner === playerA ? 'winner-glow' : currentDuelStage === 'REVEAL' && currentDuelRoundWinner && currentDuelRoundWinner !== playerA ? 'loser-shake' : ''}`}
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
						{#if currentDuelCenter?.bCardCode}
							<div class="flip-wrap" data-cycle={centerRevealCycle}>
								<div
									class="flipper"
									class:start-back={currentDuelStage !== 'REVEAL'}
									class:animate={currentDuelStage === 'REVEAL'}
									style={`--flip-ms:${FLIP_MS}ms;`}
								>
									<div class="face front">
										<div
											bind:this={centerSlotBElement}
											class={`result-wrap ${currentDuelStage === 'REVEAL' && currentDuelRoundWinner === playerB ? 'winner-glow' : currentDuelStage === 'REVEAL' && currentDuelRoundWinner && currentDuelRoundWinner !== playerB ? 'loser-shake' : ''}`}
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
												cornerNumberValue={cardDetailsCacheByCode.get(
													$gameStateStore.duelCenter.bCardCode
												)?.number ?? 0}
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
                                                        <button
                                                                class="btn attribute-option"
                                                                class:attribute-highlight={isHighlightedAttribute('magic')}
                                                                disabled={isGameOver()}
                                                                on:click={() => chooseAttr('magic')}
                                                                title={`Choose magic (${chooserCardDetails?.magic ?? '–'})`}
                                                                aria-label={`Choose magic (${chooserCardDetails?.magic ?? 'unknown'})`}
                                                        >
                                                                <img src="/icons/magic_icon.png" alt="Magic icon" />
                                                                {#if chooserCardDetails}
                                                                        <span class="attribute-value">{chooserCardDetails.magic}</span>
                                                                {/if}
                                                        </button>
                                                        <button
                                                                class="btn attribute-option"
                                                                class:attribute-highlight={isHighlightedAttribute('might')}
                                                                disabled={isGameOver()}
                                                                on:click={() => chooseAttr('might')}
                                                                title={`Choose might (${chooserCardDetails?.might ?? '–'})`}
                                                                aria-label={`Choose might (${chooserCardDetails?.might ?? 'unknown'})`}
                                                        >
                                                                <img src="/icons/strength_icon.png" alt="Might icon" />
                                                                {#if chooserCardDetails}
                                                                        <span class="attribute-value">{chooserCardDetails.might}</span>
                                                                {/if}
                                                        </button>
                                                        <button
                                                                class="btn attribute-option"
                                                                class:attribute-highlight={isHighlightedAttribute('fire')}
                                                                disabled={isGameOver()}
                                                                on:click={() => chooseAttr('fire')}
                                                                title={`Choose fire (${chooserCardDetails?.fire ?? '–'})`}
                                                                aria-label={`Choose fire (${chooserCardDetails?.fire ?? 'unknown'})`}
                                                        >
                                                                <img src="/icons/fire_icon.png" alt="Fire icon" />
                                                                {#if chooserCardDetails}
                                                                        <span class="attribute-value">{chooserCardDetails.fire}</span>
                                                                {/if}
                                                        </button>
						</div>
					</div>
				{:else if duelStage === 'PICK_ATTRIBUTE'}
					<div class="notice warn" style="margin-top:12px; text-align:center;">
						Waiting for {chooserId} to choose the attribute…
					</div>
				{/if}

				{#if duelStage === 'REVEAL' && !currentDuelRoundWinner}
					<div class="notice chooser" style="margin-top:12px; text-align:center;">
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
                                                <div class="scroll" bind:this={historyScrollContainerElement}>
                                                        {#each $gameStateStore.log as line, index (index)}
                                                                {@const presentation = getLogPresentation(line)}
                                                                <div class={`log-entry ${presentation.category}`}>
                                                                        <span class="log-marker" aria-hidden="true">
                                                                                {presentation.icon}
                                                                        </span>
                                                                        <span class="log-text">{presentation.text}</span>
                                                                </div>
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
