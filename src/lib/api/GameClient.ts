// src/lib/api/GameClient.ts
import type { Card, GameState } from '$lib/stores/game';

interface KairosImportMetaEnv extends ImportMetaEnv {
        VITE_API_BASE_URL?: string;
}

const environment = import.meta.env as KairosImportMetaEnv;
const apiBaseUrl: string = environment.DEV ? '' : environment.VITE_API_BASE_URL ?? '';

function convertHeadersToObject(headersInit?: HeadersInit): Record<string, string> {
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

async function requestJsonFromGameApi<T = unknown>(
        path: string,
        init: RequestInit = {},
        token?: string
): Promise<T> {
        const url = `${apiBaseUrl}${path}`;
        const combinedHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                ...convertHeadersToObject(init.headers)
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

type RawCardMetadata = {
        number?: number | string | null;
} | null;

type RawCard = {
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
        meta?: RawCardMetadata;
        metadata?: RawCardMetadata;
        no?: number | string | null;
        idx?: number | string | null;
        id?: number | string | null;
};

function resolveCardNumber(raw: RawCard): number {
        const possibleValues: Array<number | string | null | undefined> = [
                raw.number,
                raw.cardNumber,
                raw.cornerNumber,
                raw.meta?.number,
                raw.metadata?.number,
                raw.no,
                raw.idx,
                raw.id
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

function normalizeCard(raw: RawCard): Card {
        return {
                code: raw.code,
                name: raw.name,
                description: raw.description ?? '',
                image: raw.imageUrl,
                damage: raw.damage ?? 0,
                heal: raw.heal ?? 0,
                fire: raw.fire ?? 0,
                might: raw.might ?? 0,
                magic: raw.magic ?? 0,
                number: resolveCardNumber(raw)
        };
}

/* ---------- Health ---------- */
export async function health(): Promise<string> {
        const response = await fetch(`${apiBaseUrl}/game/test`);
        if (!response.ok) throw new Error(`Health-check failed: ${response.status}`);
        return response.text();
}

/* ---------- Auth ---------- */
export async function register(username: string, password: string) {
        return requestJsonFromGameApi<{
                accessToken: string;
                user: { id: string; username: string; role: 'USER' | 'ADMIN' };
        }>(
                '/auth/register',
                { method: 'POST', body: JSON.stringify({ username, password }) }
        );
}
export async function login(username: string, password: string) {
        return requestJsonFromGameApi<{
                accessToken: string;
                user: { id: string; username: string; role: 'USER' | 'ADMIN' };
        }>(
                '/auth/login',
                { method: 'POST', body: JSON.stringify({ username, password }) }
        );
}
export async function me(token: string) {
        return requestJsonFromGameApi<{ id: string; username: string; role: 'USER' | 'ADMIN' }>(
                '/auth/me',
                {},
                token
        );
}

/* ---------- Start / End ---------- */
export async function startClassicGame(playerAId: string) {
        return requestJsonFromGameApi<{ gameId: string }>(
                '/game/start-classic',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId })
                }
        );
}
export async function startDuelGame(playerAId: string) {
        return requestJsonFromGameApi<{ gameId: string }>(
                '/game/start-duel',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId })
                }
        );
}
export async function startGame(playerAId: string) {
        return requestJsonFromGameApi<{ gameId: string }>(
                '/game/start',
                {
                        method: 'POST',
                        body: JSON.stringify({ playerAId })
                }
        );
}
export async function endGameOnServer(gameId: string, token?: string) {
        return requestJsonFromGameApi(`/game/end/${encodeURIComponent(gameId)}`, { method: 'DELETE' }, token);
}

/* ---------- State / Result ---------- */
export async function getGameState(gameId: string): Promise<GameState | null> {
        const response = await fetch(`${apiBaseUrl}/game/state/${encodeURIComponent(gameId)}`);
        if (!response.ok) throw new Error(`Failed to fetch game state: ${response.status}`);
        return (await response.json()) as GameState | null;
}
export async function getGameResult(gameId: string) {
        return requestJsonFromGameApi<GameResult>(`/game/result/${encodeURIComponent(gameId)}`);
}

/* ---------- Classic actions ---------- */
export async function playCard(gameId: string, playerId: string, cardCode: string) {
        return requestJsonFromGameApi(
                '/game/play-card',
                {
                        method: 'POST',
                        body: JSON.stringify({ gameId, player: playerId, card: cardCode })
                }
        );
}
export async function skipTurn(gameId: string, playerId: string) {
        return requestJsonFromGameApi(
                '/game/skip-turn',
                {
                        method: 'POST',
                        body: JSON.stringify({ gameId, player: playerId })
                }
        );
}

/* ---------- Duel actions ---------- */
export async function chooseCardForDuel(gameId: string, playerId: string, cardCode: string) {
        return requestJsonFromGameApi(
                `/game/${encodeURIComponent(gameId)}/duel/choose-card`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId, cardCode })
                }
        );
}
export async function chooseAttributeForDuel(
        gameId: string,
        playerId: string,
        attribute: 'magic' | 'might' | 'fire'
) {
        return requestJsonFromGameApi(
                `/game/${encodeURIComponent(gameId)}/duel/choose-attribute`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId, attribute })
                }
        );
}
export async function unchooseCardForDuel(gameId: string, playerId: string) {
        return requestJsonFromGameApi(
                `/game/${encodeURIComponent(gameId)}/duel/unchoose-card`,
                {
                        method: 'POST',
                        body: JSON.stringify({ playerId })
                }
        );
}
export async function advanceDuel(gameId: string) {
        return requestJsonFromGameApi(`/game/${encodeURIComponent(gameId)}/duel/advance`, { method: 'POST' });
}
export async function advanceDuelRound(gameId: string) {
        return advanceDuel(gameId);
}

/* ---------- Cards ---------- */
const cardMetadataCache = new Map<string, Card>();
export async function getCardMeta(code: string): Promise<Card> {
        const cachedCard = cardMetadataCache.get(code);
        if (cachedCard) return cachedCard;
        try {
                const rawCard = await requestJsonFromGameApi<RawCard>(
                        `/game/cards/${encodeURIComponent(code)}`
                );
                const normalizedCard = normalizeCard(rawCard);
                cardMetadataCache.set(code, normalizedCard);
                return normalizedCard;
        } catch {
                const allCards = await requestJsonFromGameApi<RawCard[]>('/game/cards');
                const foundCard = allCards.find((card) => card.code === code);
                if (!foundCard) throw new Error(`Card ${code} not found`);
                const normalizedCard = normalizeCard(foundCard);
                cardMetadataCache.set(code, normalizedCard);
                return normalizedCard;
        }
}
export async function getCardMetas(codes: string[]): Promise<Card[]> {
        const requestedCodesWithoutCache = codes.filter((cardCode) => !cardMetadataCache.has(cardCode));
        if (requestedCodesWithoutCache.length) {
                try {
                        const queryString = encodeURIComponent(requestedCodesWithoutCache.join(','));
                        const rawCards = await requestJsonFromGameApi<RawCard[]>(`/game/cards?codes=${queryString}`);
                        for (const rawCard of rawCards) {
                                cardMetadataCache.set(rawCard.code, normalizeCard(rawCard));
                        }
                } catch {
                        const allCards = await requestJsonFromGameApi<RawCard[]>('/game/cards');
                        for (const cardCode of requestedCodesWithoutCache) {
                                const fallbackCard = allCards.find((candidate) => candidate.code === cardCode);
                                if (fallbackCard) {
                                        cardMetadataCache.set(cardCode, normalizeCard(fallbackCard));
                                }
                        }
                }
        }
        const resolvedCards: Card[] = [];
        for (const cardCode of codes) {
                const cachedCard = cardMetadataCache.get(cardCode);
                if (cachedCard) {
                        resolvedCards.push(cachedCard);
                }
        }
        return resolvedCards;
}

// list only the games belonging to the authenticated user
export async function listMyActive(token: string): Promise<GameSummary[]> {
        const response = await fetch(`${apiBaseUrl}/game/active/mine`, {
                headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return (await response.json()) as GameSummary[];
}

/* ---------- Active games (admin) ---------- */
export async function listActive(token?: string) {
        return requestJsonFromGameApi<GameSummary[]>('/game/active', {}, token);
}
export async function listActiveRaw(token?: string) {
        return listActive(token);
}
export async function expireGames(token?: string) {
        return requestJsonFromGameApi('/game/expire', { method: 'POST' }, token);
}

/* ---------- Statistics ---------- */
export async function myStats(
        token: string
): Promise<{ gamesPlayed: number; gamesWon: number; gamesDrawn: number }> {
        return requestJsonFromGameApi('/game/stats/me', {}, token);
}

/* ---------- Catalog ---------- */
export type CardCatalogItem = {
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
export async function listAllCards(): Promise<CardCatalogItem[]> {
        return requestJsonFromGameApi<CardCatalogItem[]>('/game/cards');
}
