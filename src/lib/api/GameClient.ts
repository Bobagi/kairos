import type { Card } from '$lib/stores/game';

// no CORS in dev → use proxy (empty base). In prod, point to API.
const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE;

async function fetchJsonStrict<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${init?.method ?? 'GET'} ${url} failed (${res.status}): ${body}`);
	}
	return res.json() as Promise<T>;
}

/* ---------- Types ---------- */
export type GameMode = 'CLASSIC' | 'ATTRIBUTE_DUEL';

export type GameSummary = {
	id: string;
	playerAId: string;
	mode: GameMode;
};

export type GameResult = {
	winner: string | null;
	log: string[];
};

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
		magic: raw.magic ?? 0
	};
}

/* ---------- Health ---------- */
export async function health(): Promise<string> {
	const res = await fetch(`${API_BASE}/game/test`);
	if (!res.ok) throw new Error(`Health-check failed: ${res.status}`);
	return res.text();
}

/* ---------- Start / End ---------- */
export async function startClassicGame(playerAId: string) {
	return fetchJsonStrict<{ gameId: string }>(`${API_BASE}/game/start-classic`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
}

export async function startDuelGame(playerAId: string) {
	return fetchJsonStrict<{ gameId: string }>(`${API_BASE}/game/start-duel`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
}

// legacy
export async function startGame(playerAId: string) {
	return fetchJsonStrict<{ gameId: string }>(`${API_BASE}/game/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
}

export async function endGameOnServer(gameId: string) {
	await fetchJsonStrict(`${API_BASE}/game/end/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
}

/* ---------- State / Result ---------- */
export async function getGameState(gameId: string): Promise<any | null> {
	const res = await fetch(`${API_BASE}/game/state/${encodeURIComponent(gameId)}`);
	if (!res.ok) throw new Error(`Failed to fetch game state: ${res.status}`);
	return res.json();
}

export async function getGameResult(gameId: string) {
	return fetchJsonStrict<GameResult>(`${API_BASE}/game/result/${encodeURIComponent(gameId)}`);
}

/* ---------- Actions (classic) ---------- */
export async function playCard(gameId: string, playerId: string, cardCode: string) {
	await fetchJsonStrict(`${API_BASE}/game/play-card`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ gameId, player: playerId, card: cardCode })
	});
}

export async function skipTurn(gameId: string, playerId: string) {
	await fetchJsonStrict(`${API_BASE}/game/skip-turn`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ gameId, player: playerId })
	});
}

/* ---------- Actions (duel) ---------- */
export async function chooseCardForDuel(gameId: string, playerId: string, cardCode: string) {
	return fetchJsonStrict(`${API_BASE}/game/${encodeURIComponent(gameId)}/duel/choose-card`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerId, cardCode })
	});
}

export async function chooseAttributeForDuel(
	gameId: string,
	playerId: string,
	attribute: 'magic' | 'might' | 'fire'
) {
	return fetchJsonStrict(`${API_BASE}/game/${encodeURIComponent(gameId)}/duel/choose-attribute`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerId, attribute })
	});
}

export async function unchooseCardForDuel(gameId: string, playerId: string) {
	const resp = await fetch(`/game/${gameId}/duel/unchoose-card`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerId })
	});
	if (!resp.ok) throw new Error('unchoose failed');
	return resp.json();
}

/** Advance from REVEAL → (commit round) → PICK_CARD/RESOLVED */
export async function advanceDuel(gameId: string) {
	return fetchJsonStrict(`${API_BASE}/game/${encodeURIComponent(gameId)}/duel/advance`, {
		method: 'POST'
	});
}

// aliases (so old imports don't break)
export { chooseAttributeForDuel as chooseDuelAttribute, chooseCardForDuel as selectDuelCard };

/* ---------- Cards metadata ---------- */
const cache = new Map<string, Card>();

export async function getCardMeta(code: string): Promise<Card> {
	if (cache.has(code)) return cache.get(code)!;

	// try single route
	try {
		const raw = await fetchJsonStrict<RawCard>(
			`${API_BASE}/game/cards/${encodeURIComponent(code)}`
		);
		const norm = normalizeCard(raw);
		cache.set(code, norm);
		return norm;
	} catch {
		// fallback: fetch all and filter
		const all = await fetchJsonStrict<RawCard[]>(`${API_BASE}/game/cards`);
		const found = all.find((c) => c.code === code);
		if (!found) throw new Error(`Card ${code} not found`);
		const norm = normalizeCard(found);
		cache.set(code, norm);
		return norm;
	}
}

export async function getCardMetas(codes: string[]): Promise<Card[]> {
	const missing = codes.filter((c) => !cache.has(c));
	if (missing.length) {
		// batch: /game/cards?codes=a,b
		try {
			const qs = encodeURIComponent(missing.join(','));
			const raw = await fetchJsonStrict<RawCard[]>(`${API_BASE}/game/cards?codes=${qs}`);
			for (const r of raw) cache.set(r.code, normalizeCard(r));
		} catch {
			// fallback: fetch all and fill
			const all = await fetchJsonStrict<RawCard[]>(`${API_BASE}/game/cards`);
			for (const code of missing) {
				const r = all.find((x) => x.code === code);
				if (r) cache.set(code, normalizeCard(r));
			}
		}
	}
	return codes.map((c) => cache.get(c)!).filter(Boolean);
}

/* ---------- Active games (both modes) ---------- */
export async function listActiveRaw(): Promise<any[]> {
	return fetchJsonStrict<any[]>(`${API_BASE}/game/active`);
}

export async function listActive(): Promise<GameSummary[]> {
	const raw = await listActiveRaw();
	return raw.map((g: any) => ({
		id: typeof g.gameId === 'string' ? g.gameId : String(g?.gameId ?? ''),
		playerAId: Array.isArray(g.players) && g.players.length > 0 ? g.players[0] : 'unknown',
		mode: (g.mode as GameMode) ?? 'CLASSIC'
	}));
}

export async function expireGames() {
	await fetchJsonStrict(`${API_BASE}/game/expire`, { method: 'POST' });
}

export async function advanceDuelRound(gameId: string) {
	return fetchJsonStrict(`${API_BASE}/game/${encodeURIComponent(gameId)}/duel/advance`, {
		method: 'POST'
	});
}

// --- Tipos básicos de carta (catálogo) ---
export type CardCatalogItem = {
	code: string;
	name: string;
	description: string;
	image?: string; // alguns backends usam image
	imageUrl?: string; // outros usam imageUrl
	might: number;
	fire: number;
	magic: number;
	number: number;
};

// --- Listar todas as cartas do banco ---
export async function listAllCards(): Promise<CardCatalogItem[]> {
	const res = await fetch('/game/cards');
	if (!res.ok) throw new Error(`Failed to fetch cards: ${res.status}`);
	return (await res.json()) as CardCatalogItem[];
}
