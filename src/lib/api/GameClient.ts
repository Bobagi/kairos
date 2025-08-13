import type { Card } from '$lib/stores/game';

const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE;

/** Generic JSON fetcher with nice errors */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${init?.method ?? 'GET'} ${url} failed (${res.status}): ${body}`);
	}
	return res.json() as Promise<T>;
}

/** ---- Types for game APIs ---- */

export interface GameSummary {
	id: string;
	playerAId: string;
}

export interface GameResult {
	winner: string | null; // null => tie or no winner
	log: string[];
}

/** ---- Game REST calls ---- */

export async function listActiveRaw(): Promise<any[]> {
	return fetchJSON<any[]>(`${API_BASE}/game/active`);
}

export async function listActive(): Promise<GameSummary[]> {
	const raw = await listActiveRaw();
	return raw.map((g: any) => {
		const id = typeof g.gameId === 'string' ? g.gameId : String(g?.gameId ?? '');
		const playerAId = Array.isArray(g.players) && g.players.length > 0 ? g.players[0] : 'unknown';
		return { id, playerAId };
	});
}

export async function health(): Promise<string> {
	const res = await fetch(`${API_BASE}/game/test`);
	if (!res.ok) throw new Error(`Health-check failed: ${res.status}`);
	return res.text();
}

export async function startGame(playerAId: string): Promise<{ gameId: string }> {
	return fetchJSON<{ gameId: string }>(`${API_BASE}/game/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
}

export async function expireGames(): Promise<void> {
	await fetchJSON(`${API_BASE}/game/expire`, { method: 'POST' });
}

export async function endGameOnServer(gameId: string): Promise<void> {
	await fetchJSON(`${API_BASE}/game/end/${gameId}`, { method: 'DELETE' });
}

export async function getGameState(gameId: string): Promise<any | null> {
	// The API returns null (200) if the game ended and is no longer in memory.
	const res = await fetch(`${API_BASE}/game/state/${gameId}`);
	if (!res.ok) throw new Error(`Failed to fetch game state: ${res.status}`);
	return res.json();
}

export async function getGameResult(gameId: string): Promise<GameResult> {
	return fetchJSON<GameResult>(`${API_BASE}/game/result/${gameId}`);
}

export async function playCard(gameId: string, playerId: string, cardCode: string): Promise<void> {
	await fetchJSON(`${API_BASE}/game/play-card`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ gameId, player: playerId, card: cardCode })
	});
}

export async function skipTurn(gameId: string, playerId: string): Promise<void> {
	await fetchJSON(`${API_BASE}/game/skip-turn`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ gameId, player: playerId })
	});
}

/* ------------------------------------------------------------------ */
/* Cards metadata (description, fire, might, magic, heal, damage, img)*/
/* ------------------------------------------------------------------ */

/** Raw shape from the backend (fields can be null/optional there). */
type RawCard = {
	code: string;
	name: string;
	description: string;
	imageUrl: string;
	damage?: number | null;
	heal?: number | null;
	fire?: number | null;
	might?: number | null;
	magic?: number | null;
};

/** Normalize raw -> Card (your UI type), with safe numeric defaults. */
function normalizeCard(raw: RawCard): Card {
	return {
		code: raw.code,
		name: raw.name,
		description: raw.description ?? '',
		image: raw.imageUrl, // your Card.image expects this name
		damage: raw.damage ?? 0,
		heal: raw.heal ?? 0,
		fire: raw.fire ?? 0,
		might: raw.might ?? 0,
		magic: raw.magic ?? 0
	};
}

/** In-memory cache to avoid refetching. */
const cardCache = new Map<string, Card>();

/** Fetch one card meta by code. */
export async function getCardMeta(code: string): Promise<Card> {
	if (cardCache.has(code)) return cardCache.get(code)!;

	// Try conventional endpoints. Adjust to match your backend routes.
	// 1) /cards/:code
	try {
		const meta = await fetchJSON<RawCard>(`${API_BASE}/cards/${encodeURIComponent(code)}`);
		const norm = normalizeCard(meta);
		cardCache.set(code, norm);
		return norm;
	} catch {
		/* fall through to alt route below */
	}

	// 2) /card/:code
	const meta = await fetchJSON<RawCard>(`${API_BASE}/card/${encodeURIComponent(code)}`);
	const norm = normalizeCard(meta);
	cardCache.set(code, norm);
	return norm;
}

/** Fetch many card metas by code; tries batch first then falls back. */
export async function getCardMetas(codes: string[]): Promise<Card[]> {
	const need = codes.filter((c) => !cardCache.has(c));
	let fetched: RawCard[] = [];

	if (need.length) {
		const q = need.map(encodeURIComponent).join(',');
		// try batch: /cards?codes=a,b,c
		try {
			fetched = await fetchJSON<RawCard[]>(`${API_BASE}/cards?codes=${q}`);
			for (const r of fetched) {
				const n = normalizeCard(r);
				cardCache.set(n.code, n);
			}
		} catch {
			// fallback: fetch individually
			for (const code of need) {
				const one = await getCardMeta(code);
				cardCache.set(code, one);
			}
		}
	}

	// return in the same order
	return codes.map((c) => cardCache.get(c)!);
}
