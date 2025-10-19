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

export type ChronosFriendStatus =
        | 'ONLINE'
        | 'OFFLINE'
        | 'IN_GAME'
        | 'BLOCKED'
        | 'PENDING'
        | string;

export type ChronosFriendSummary = {
        id: string;
        username: string;
        status?: ChronosFriendStatus;
};

export type ChronosFriendRequest = {
        id: string;
        from: { id: string; username: string };
        createdAt?: string | null;
};

export type ChronosChatMessage = {
        id: string;
        senderId: string;
        senderUsername?: string;
        content: string;
        createdAt?: string | null;
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

export async function surrenderChronosGame(
        gameIdentifier: string,
        token: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/game/surrender',
                {
                        method: 'POST',
                        body: JSON.stringify({ gameId: gameIdentifier })
                },
                token
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

/* ---------- Friends & Chat ---------- */
type ChronosRawFriendUser = {
        id?: string;
        username?: string;
        status?: string;
        state?: string;
        online?: boolean;
};

type ChronosRawFriendRecord = ChronosRawFriendUser & {
        friendId?: string;
        friend?: ChronosRawFriendUser;
        user?: ChronosRawFriendUser;
        profile?: ChronosRawFriendUser;
        friendUsername?: string;
};

type ChronosRawFriendRequestRecord = {
        id?: string;
        requestId?: string;
        from?: ChronosRawFriendUser;
        fromUser?: ChronosRawFriendUser;
        sender?: ChronosRawFriendUser;
        requester?: ChronosRawFriendUser;
        user?: ChronosRawFriendUser;
        createdAt?: string;
        created_at?: string;
};

type ChronosRawChatMessageRecord = {
        id?: string;
        messageId?: string;
        senderId?: string;
        sender_id?: string;
        sender?: ChronosRawFriendUser;
        user?: ChronosRawFriendUser;
        from?: ChronosRawFriendUser;
        content?: string;
        text?: string;
        message?: string;
        createdAt?: string;
        created_at?: string;
        sentAt?: string;
};

function normalizeFriendSummary(raw: unknown): ChronosFriendSummary | null {
        if (!raw || typeof raw !== 'object') return null;
        const candidate = raw as ChronosRawFriendRecord;
        const fallbackUser = candidate.friend ?? candidate.user ?? candidate.profile ?? null;
        const possibleIds: Array<unknown> = [
                candidate.friendId,
                candidate.id,
                fallbackUser?.id,
                candidate.user?.id
        ];
        let id: string | null = null;
        for (const maybeId of possibleIds) {
                if (typeof maybeId === 'string' && maybeId.trim()) {
                        id = maybeId;
                        break;
                }
        }
        if (!id && typeof candidate.username === 'string' && candidate.username.trim()) {
                id = candidate.username;
        }
        if (!id) return null;
        const possibleUsernames: Array<unknown> = [
                candidate.username,
                candidate.friendUsername,
                fallbackUser?.username,
                candidate.user?.username
        ];
        let username: string | null = null;
        for (const maybeUsername of possibleUsernames) {
                if (typeof maybeUsername === 'string' && maybeUsername.trim()) {
                        username = maybeUsername;
                        break;
                }
        }
        if (!username) username = id;
        const statusCandidate =
                candidate.status ??
                fallbackUser?.status ??
                candidate.state ??
                (typeof candidate.online === 'boolean'
                        ? candidate.online
                                ? 'ONLINE'
                                : 'OFFLINE'
                        : undefined);
        const status = typeof statusCandidate === 'string' ? statusCandidate : undefined;
        return { id, username, status };
}

function normalizeFriendRequest(raw: unknown): ChronosFriendRequest | null {
        if (!raw || typeof raw !== 'object') return null;
        const candidate = raw as ChronosRawFriendRequestRecord;
        const idCandidate = candidate.id ?? candidate.requestId ?? null;
        const id = typeof idCandidate === 'string' ? idCandidate : null;
        const fromCandidate =
                candidate.from ??
                candidate.fromUser ??
                candidate.sender ??
                candidate.requester ??
                candidate.user ??
                null;
        const fromId = typeof fromCandidate?.id === 'string' ? fromCandidate.id : null;
        const fromUsernameCandidate = fromCandidate?.username ?? fromId ?? null;
        if (!id || !fromId) return null;
        return {
                id,
                from: { id: fromId, username: typeof fromUsernameCandidate === 'string' ? fromUsernameCandidate : fromId },
                createdAt: candidate.createdAt ?? candidate.created_at ?? null
        };
}

function normalizeChatMessage(raw: unknown): ChronosChatMessage | null {
        if (!raw || typeof raw !== 'object') return null;
        const candidate = raw as ChronosRawChatMessageRecord;
        const idCandidate = candidate.id ?? candidate.messageId ?? null;
        const id = typeof idCandidate === 'string' ? idCandidate : null;
        const senderIdCandidate =
                candidate.senderId ??
                candidate.sender_id ??
                candidate.sender?.id ??
                candidate.user?.id ??
                candidate.from?.id;
        const senderId = typeof senderIdCandidate === 'string' ? senderIdCandidate : null;
        if (!id || !senderId) return null;
        const contentCandidate = candidate.content ?? candidate.message ?? candidate.text ?? '';
        const content = typeof contentCandidate === 'string' ? contentCandidate : String(contentCandidate ?? '');
        const senderUsername =
                candidate.sender?.username ??
                candidate.user?.username ??
                candidate.from?.username ??
                undefined;
        const createdAt = candidate.createdAt ?? candidate.created_at ?? candidate.sentAt ?? null;
        return { id, senderId, senderUsername, content, createdAt };
}

export async function searchChronosPlayers(
        query: string,
        token: string
): Promise<ChronosFriendSummary[]> {
        if (!query.trim()) return [];
        const rawResults = await performChronosApiRequestReturningJson<unknown[]>(
                `/friends/search?q=${encodeURIComponent(query)}`,
                {},
                token
        );
        if (!Array.isArray(rawResults)) return [];
        return rawResults
                .map((entry) => normalizeFriendSummary(entry))
                .filter((entry): entry is ChronosFriendSummary => Boolean(entry));
}

export async function listChronosFriends(token: string): Promise<ChronosFriendSummary[]> {
        const rawResults = await performChronosApiRequestReturningJson<unknown[]>(
                '/friends',
                {},
                token
        );
        if (!Array.isArray(rawResults)) return [];
        return rawResults
                .map((entry) => normalizeFriendSummary(entry))
                .filter((entry): entry is ChronosFriendSummary => Boolean(entry));
}

export async function listChronosFriendRequests(token: string): Promise<ChronosFriendRequest[]> {
        const rawResults = await performChronosApiRequestReturningJson<unknown[]>(
                '/friends/requests',
                {},
                token
        );
        if (!Array.isArray(rawResults)) return [];
        return rawResults
                .map((entry) => normalizeFriendRequest(entry))
                .filter((entry): entry is ChronosFriendRequest => Boolean(entry));
}

export async function sendChronosFriendRequest(targetId: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                '/friends/request',
                { method: 'POST', body: JSON.stringify({ targetId }) },
                token
        );
}

export async function acceptChronosFriendRequest(
        requestId: string,
        token: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/friends/request/${encodeURIComponent(requestId)}/accept`,
                { method: 'POST' },
                token
        );
}

export async function rejectChronosFriendRequest(
        requestId: string,
        token: string
): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/friends/request/${encodeURIComponent(requestId)}/reject`,
                { method: 'POST' },
                token
        );
}

export async function removeChronosFriend(friendId: string, token: string): Promise<unknown> {
        return performChronosApiRequestReturningJson(
                `/friends/${encodeURIComponent(friendId)}`,
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
): Promise<ChronosChatMessage[]> {
        const rawResults = await performChronosApiRequestReturningJson<unknown[]>(
                `/friends/chat/${encodeURIComponent(friendId)}`,
                {},
                token
        );
        if (!Array.isArray(rawResults)) return [];
        return rawResults
                .map((entry) => normalizeChatMessage(entry))
                .filter((entry): entry is ChronosChatMessage => Boolean(entry));
}

export async function sendChronosFriendChatMessage(
        friendId: string,
        content: string,
        token: string
): Promise<ChronosChatMessage | null> {
        const raw = await performChronosApiRequestReturningJson<unknown>(
                `/friends/chat/${encodeURIComponent(friendId)}`,
                { method: 'POST', body: JSON.stringify({ content }) },
                token
        );
        return normalizeChatMessage(raw);
}

export async function startChronosGameWithFriend(
        friendId: string,
        token: string,
        mode: GameMode = 'CLASSIC'
): Promise<{ gameId: string; mode: GameMode }> {
        return performChronosApiRequestReturningJson(
                '/game/start-with-friend',
                { method: 'POST', body: JSON.stringify({ friendId, mode }) },
                token
        );
}
