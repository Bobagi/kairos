// src/lib/api/GameClient.ts
import type { Card, GameState } from '$lib/stores/game';

interface KairosRuntimeEnvironmentVariables extends ImportMetaEnv {
        VITE_API_BASE_URL?: string;
}

const runtimeEnvironmentVariables = import.meta.env as KairosRuntimeEnvironmentVariables;
const chronosApiBaseUrl: string = runtimeEnvironmentVariables.DEV
        ? ''
        : runtimeEnvironmentVariables.VITE_API_BASE_URL ?? '';

function normalizeHeadersInitToObject(headersInit?: HeadersInit): Record<string, string> {
        if (!headersInit) {
                return {};
        }
        if (headersInit instanceof Headers) {
                return Object.fromEntries(headersInit.entries());
        }
        if (Array.isArray(headersInit)) {
                return Object.fromEntries(headersInit);
        }
        return { ...headersInit };
}

async function performChronosApiRequestReturningJson<T = unknown>(
        path: string,
        init: RequestInit = {},
        token?: string
): Promise<T> {
        const url = `${chronosApiBaseUrl}${path}`;
        const combinedHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                ...normalizeHeadersInitToObject(init.headers)
        };
        if (token) {
                combinedHeaders.Authorization = `Bearer ${token}`;
        }
        const response = await fetch(url, { ...init, headers: combinedHeaders });
        if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${body}`);
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
                return (await response.json()) as T;
        }
        return null as unknown as T;
}

/* ---------- Types ---------- */
export type GameMode = 'CLASSIC' | 'ATTRIBUTE_DUEL';
export type GameSummary = { id: string; playerAId: string; mode: GameMode };
export type GameResult = { winner: string | null; log: string[] };

export type ChronosPlayerSummary = { id: string; username: string };

export type ChronosFriendSummary = {
        friendshipId: string;
        friend: ChronosPlayerSummary;
        status: 'PENDING' | 'ACCEPTED' | 'BLOCKED';
        blockedByMe: boolean;
};

export type ChronosIncomingFriendRequest = {
        friendshipId: string;
        requester: ChronosPlayerSummary;
        createdAt: string;
};

export type ChronosFriendChatMessage = {
        id: string;
        senderId: string;
        recipientId: string;
        body: string;
        createdAt: string;
};

export type ChronosFriendChatHistory = {
        friendshipId: string;
        messages: ChronosFriendChatMessage[];
};

type ChronosRawCardMetadata = {
        number?: number | string | null;
} | null;

type ChronosRawCardPayload = {
        code: string;
        name: string;
        description?: string | null;
        imageUrl: string;
        damage?: number | null;
        heal?: number | null;
        fire?: number | null;
        might?: number | null;
        magic?: number | null;
        number?: number | string | null;
        cardNumber?: number | string | null;
        cornerNumber?: number | string | null;
        meta?: ChronosRawCardMetadata;
        metadata?: ChronosRawCardMetadata;
        no?: number | string | null;
        idx?: number | string | null;
        id?: number | string | null;
};

function resolveCardNumberFromChronosRawCardPayload(rawChronosCard: ChronosRawCardPayload): number {
        const possibleValues: Array<number | string | null | undefined> = [
                rawChronosCard.number,
                rawChronosCard.cardNumber,
                rawChronosCard.cornerNumber,
                rawChronosCard.meta?.number,
                rawChronosCard.metadata?.number,
                rawChronosCard.no,
                rawChronosCard.idx,
                rawChronosCard.id
        ];
        for (const value of possibleValues) {
                if (value === null || value === undefined) {
                        continue;
                }
                const parsedNumber = typeof value === 'number' ? value : Number(value);
                if (!Number.isNaN(parsedNumber)) {
                        return parsedNumber;
                }
        }
        return 0;
}

function convertChronosRawCardPayloadToCard(rawChronosCard: ChronosRawCardPayload): Card {
        return {
                code: rawChronosCard.code,
                name: rawChronosCard.name,
                description: rawChronosCard.description ?? '',
                image: rawChronosCard.imageUrl,
                damage: rawChronosCard.damage ?? 0,
                heal: rawChronosCard.heal ?? 0,
                fire: rawChronosCard.fire ?? 0,
                might: rawChronosCard.might ?? 0,
                magic: rawChronosCard.magic ?? 0,
                number: resolveCardNumberFromChronosRawCardPayload(rawChronosCard)
        };
}

/* ---------- Health ---------- */
export async function checkChronosHealthStatus(): Promise<string> {
        const response = await fetch(`${chronosApiBaseUrl}/game/test`);
        if (!response.ok) throw new Error(`Health-check failed: ${response.status}`);
        return response.text();
}

/* ---------- Auth ---------- */
export async function registerChronosUserAccount(
        username: string,
        password: string
): Promise<{
        accessToken: string;
        user: { id: string; username: string; role: 'USER' | 'ADMIN' };
}> {
        return performChronosApiRequestReturningJson(
                '/auth/register',
                { method: 'POST', body: JSON.stringify({ username, password }) }
        );
}

export async function loginChronosUserAccount(
        username: string,
        password: string
): Promise<{
        accessToken: string;
        user: { id: string; username: string; role: 'USER' | 'ADMIN' };
}> {
        return performChronosApiRequestReturningJson(
                '/auth/login',
                { method: 'POST', body: JSON.stringify({ username, password }) }
        );
}

export async function fetchAuthenticatedChronosUserProfile(
        token: string
): Promise<{ id: string; username: string; role: 'USER' | 'ADMIN' }> {
        return performChronosApiRequestReturningJson('/auth/me', {}, token);
}

/* ---------- Start / End ---------- */
export async function startClassicChronosGameForPlayer(
        playerIdentifier: string
): Promise<{ gameId: string }> {
        return performChronosApiRequestReturningJson(
                '/game/start-classic',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId: playerIdentifier })
                }
        );
}

export async function startAttributeDuelChronosGameForPlayer(
        playerIdentifier: string
): Promise<{ gameId: string }> {
        return performChronosApiRequestReturningJson(
                '/game/start-duel',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId: playerIdentifier })
                }
        );
}

export async function startChronosGameWithAutomaticModeSelection(
        playerIdentifier: string
): Promise<{ gameId: string }> {
        return performChronosApiRequestReturningJson(
                '/game/start',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId: playerIdentifier })
                }
        );
}

export async function endChronosGameSessionOnServer(
        gameIdentifier: string,
        token?: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/game/end/${encodeURIComponent(gameIdentifier)}`,
                { method: 'DELETE' },
                token
        );
}

export async function startChronosGameWithFriend(
        friendIdentifier: string,
        mode: GameMode,
        token: string
): Promise<{ gameId: string }> {
        return performChronosApiRequestReturningJson(
                '/game/start-with-friend',
                {
                        method: 'POST',
                        body: JSON.stringify({ friendId: friendIdentifier, mode })
                },
                token
        );
}

export async function surrenderChronosGame(gameIdentifier: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/game/surrender',
                {
                        method: 'POST',
                        body: JSON.stringify({ gameId: gameIdentifier })
                },
                token
        );
}

/* ---------- State / Result ---------- */
export async function fetchChronosGameStateById(
        gameIdentifier: string
): Promise<GameState | null> {
        const response = await fetch(
                `${chronosApiBaseUrl}/game/state/${encodeURIComponent(gameIdentifier)}`
        );
        if (!response.ok) throw new Error(`Failed to fetch game state: ${response.status}`);
        return (await response.json()) as GameState | null;
}

export async function fetchChronosGameResult(gameIdentifier: string): Promise<GameResult> {
        return performChronosApiRequestReturningJson(`/game/result/${encodeURIComponent(gameIdentifier)}`);
}

/* ---------- Classic actions ---------- */
export async function playCardInChronosGame(
        gameIdentifier: string,
        playerIdentifier: string,
        cardCode: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/game/play-card',
                {
                        method: 'POST',
                        body: JSON.stringify({
                                gameId: gameIdentifier,
                                player: playerIdentifier,
                                card: cardCode
                        })
                }
        );
}

export async function skipChronosGameTurn(
        gameIdentifier: string,
        playerIdentifier: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/game/skip-turn',
                {
                        method: 'POST',
                        body: JSON.stringify({ gameId: gameIdentifier, player: playerIdentifier })
                }
        );
}

/* ---------- Duel actions ---------- */
export async function chooseChronosDuelCard(
        gameIdentifier: string,
        playerIdentifier: string,
        cardCode: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/game/${encodeURIComponent(gameIdentifier)}/duel/choose-card`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId: playerIdentifier, cardCode })
                }
        );
}

export async function chooseChronosDuelAttribute(
        gameIdentifier: string,
        playerIdentifier: string,
        attribute: 'magic' | 'might' | 'fire'
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/game/${encodeURIComponent(gameIdentifier)}/duel/choose-attribute`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId: playerIdentifier, attribute })
                }
        );
}

export async function unchooseChronosDuelCard(
        gameIdentifier: string,
        playerIdentifier: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/game/${encodeURIComponent(gameIdentifier)}/duel/unchoose-card`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId: playerIdentifier })
                }
        );
}

export async function advanceChronosDuel(gameIdentifier: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/game/${encodeURIComponent(gameIdentifier)}/duel/advance`,
                { method: 'POST' }
        );
}

/* ---------- Cards ---------- */
const chronosCardMetadataCache = new Map<string, Card>();
export async function fetchChronosCardMetadata(cardCode: string): Promise<Card> {
        const cachedCard = chronosCardMetadataCache.get(cardCode);
        if (cachedCard) return cachedCard;
        try {
                const rawCard = await performChronosApiRequestReturningJson<ChronosRawCardPayload>(
                        `/game/cards/${encodeURIComponent(cardCode)}`
                );
                const normalizedCard = convertChronosRawCardPayloadToCard(rawCard);
                chronosCardMetadataCache.set(cardCode, normalizedCard);
                return normalizedCard;
        } catch {
                const allCards = await performChronosApiRequestReturningJson<ChronosRawCardPayload[]>(
                        '/game/cards'
                );
                const foundCard = allCards.find((card) => card.code === cardCode);
                if (!foundCard) throw new Error(`Card ${cardCode} not found`);
                const normalizedCard = convertChronosRawCardPayloadToCard(foundCard);
                chronosCardMetadataCache.set(cardCode, normalizedCard);
                return normalizedCard;
        }
}
export async function fetchMultipleChronosCardMetadata(cardCodes: string[]): Promise<Card[]> {
        const cardCodesMissingFromCache = cardCodes.filter(
                (candidateCode) => !chronosCardMetadataCache.has(candidateCode)
        );
        if (cardCodesMissingFromCache.length) {
                try {
                        const queryString = encodeURIComponent(cardCodesMissingFromCache.join(','));
                        const rawCards = await performChronosApiRequestReturningJson<ChronosRawCardPayload[]>(
                                `/game/cards?codes=${queryString}`
                        );
                        for (const rawCard of rawCards) {
                                chronosCardMetadataCache.set(
                                        rawCard.code,
                                        convertChronosRawCardPayloadToCard(rawCard)
                                );
                        }
                } catch {
                        const allCards = await performChronosApiRequestReturningJson<ChronosRawCardPayload[]>(
                                '/game/cards'
                        );
                        for (const missingCode of cardCodesMissingFromCache) {
                                const fallbackCard = allCards.find(
                                        (candidateCard) => candidateCard.code === missingCode
                                );
                                if (fallbackCard) {
                                        chronosCardMetadataCache.set(
                                                missingCode,
                                                convertChronosRawCardPayloadToCard(fallbackCard)
                                        );
                                }
                        }
                }
        }
        const resolvedCards: Card[] = [];
        for (const cardCode of cardCodes) {
                const cachedCard = chronosCardMetadataCache.get(cardCode);
                if (cachedCard) {
                        resolvedCards.push(cachedCard);
                }
        }
        return resolvedCards;
}

// list only the games belonging to the authenticated user
export async function listAuthenticatedChronosPlayerActiveGames(
        token: string
): Promise<GameSummary[]> {
        const response = await fetch(`${chronosApiBaseUrl}/game/active/mine`, {
                headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return (await response.json()) as GameSummary[];
}

/* ---------- Active games (admin) ---------- */
export async function listAllActiveChronosGames(token?: string): Promise<GameSummary[]> {
        return performChronosApiRequestReturningJson('/game/active', {}, token);
}

export async function expireInactiveChronosGames(token?: string): Promise<unknown> {
        return performChronosApiRequestReturningJson('/game/expire', { method: 'POST' }, token);
}

/* ---------- Statistics ---------- */
export async function fetchMyChronosGameStatistics(
        token: string
): Promise<{ gamesPlayed: number; gamesWon: number; gamesDrawn: number }> {
        return performChronosApiRequestReturningJson('/game/stats/me', {}, token);
}

/* ---------- Catalog ---------- */
export type ChronosCardCatalogItem = {
        code: string;
        name: string;
        description: string;
        image?: string;
        imageUrl?: string;
        might: number;
        fire: number;
        magic: number;
        number: number;
};
export async function fetchChronosCardCatalog(): Promise<ChronosCardCatalogItem[]> {
        return performChronosApiRequestReturningJson('/game/cards');
}

/* ---------- Friends ---------- */
export async function searchChronosPlayers(
        query: string,
        token: string
): Promise<ChronosPlayerSummary[]> {
        const trimmed = query.trim();
        if (!trimmed) return [];
        return performChronosApiRequestReturningJson(
                `/friends/search?q=${encodeURIComponent(trimmed)}`,
                {},
                token
        );
}

export async function listChronosFriends(token: string): Promise<ChronosFriendSummary[]> {
        return performChronosApiRequestReturningJson('/friends', {}, token);
}

export async function listChronosFriendRequests(
        token: string
): Promise<ChronosIncomingFriendRequest[]> {
        return performChronosApiRequestReturningJson('/friends/requests', {}, token);
}

export async function sendChronosFriendRequest(targetId: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/friends/request',
                { method: 'POST', body: JSON.stringify({ targetId }) },
                token
        );
}

export async function respondChronosFriendRequest(
        friendshipId: string,
        accept: boolean,
        token: string
): Promise<unknown> {
        const action = accept ? 'accept' : 'reject';
        return performChronosApiRequestReturningJson(
                `/friends/request/${encodeURIComponent(friendshipId)}/${action}`,
                { method: 'POST' },
                token
        );
}

export async function removeChronosFriend(friendshipId: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/friends/${encodeURIComponent(friendshipId)}`,
                { method: 'DELETE' },
                token
        );
}

export async function blockChronosPlayer(targetId: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/friends/block',
                { method: 'POST', body: JSON.stringify({ targetId }) },
                token
        );
}

export async function fetchChronosFriendChat(
        friendId: string,
        token: string
): Promise<ChronosFriendChatHistory> {
        return performChronosApiRequestReturningJson(
                `/friends/chat/${encodeURIComponent(friendId)}`,
                {},
                token
        );
}

export async function sendChronosFriendMessage(
        friendId: string,
        message: string,
        token: string
): Promise<ChronosFriendChatMessage> {
        return performChronosApiRequestReturningJson(
                `/friends/chat/${encodeURIComponent(friendId)}`,
                { method: 'POST', body: JSON.stringify({ message }) },
                token
        );
}
