// src/lib/api/GameClient.ts
import type { Card } from '$lib/stores/game';

// Em dev: base vazia (usa proxy). Em prod: URL do backend.
const API_BASE: string = (import.meta as any).env.DEV
	? '' // evita CORS
	: ((import.meta as any).env.VITE_API_BASE_URL ?? '');

async function api<T = any>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
	const url = `${API_BASE}${path}`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(init.headers as any)
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(url, { ...init, headers });
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body}`);
	}
	const ctype = res.headers.get('content-type') ?? '';
	return (ctype.includes('application/json') ? res.json() : (null as any)) as T;
}

/* ---------- Tipos ---------- */
export type GameMode = 'CLASSIC' | 'ATTRIBUTE_DUEL';
export type GameSummary = { id: string; playerAId: string; mode: GameMode };
export type GameResult = { winner: string | null; log: string[] };

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

/* ---------- Auth ---------- */
export async function register(username: string, password: string) {
	return api<{
		accessToken: string;
		user: { id: string; username: string; role: 'USER' | 'ADMIN' };
	}>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export async function login(username: string, password: string) {
	return api<{
		accessToken: string;
		user: { id: string; username: string; role: 'USER' | 'ADMIN' };
	}>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export async function me(token: string) {
	return api<{ id: string; username: string; role: 'USER' | 'ADMIN' }>('/auth/me', {}, token);
}

/* ---------- Start / End ---------- */
export async function startClassicGame(playerAId: string) {
	return api<{ gameId: string }>('/game/start-classic', {
		method: 'POST',
		body: JSON.stringify({ playerAId })
	});
}
export async function startDuelGame(playerAId: string) {
	return api<{ gameId: string }>('/game/start-duel', {
		method: 'POST',
		body: JSON.stringify({ playerAId })
	});
}
export async function startGame(playerAId: string) {
	return api<{ gameId: string }>('/game/start', {
		method: 'POST',
		body: JSON.stringify({ playerAId })
	});
}
export async function endGameOnServer(gameId: string, token?: string) {
	return api(`/game/end/${encodeURIComponent(gameId)}`, { method: 'DELETE' }, token);
}

/* ---------- State / Result ---------- */
export async function getGameState(gameId: string): Promise<any | null> {
	const res = await fetch(`${API_BASE}/game/state/${encodeURIComponent(gameId)}`);
	if (!res.ok) throw new Error(`Failed to fetch game state: ${res.status}`);
	return res.json();
}
export async function getGameResult(gameId: string) {
	return api<GameResult>(`/game/result/${encodeURIComponent(gameId)}`);
}

/* ---------- Classic actions ---------- */
export async function playCard(gameId: string, playerId: string, cardCode: string) {
	return api('/game/play-card', {
		method: 'POST',
		body: JSON.stringify({ gameId, player: playerId, card: cardCode })
	});
}
export async function skipTurn(gameId: string, playerId: string) {
	return api('/game/skip-turn', {
		method: 'POST',
		body: JSON.stringify({ gameId, player: playerId })
	});
}

/* ---------- Duel actions ---------- */
export async function chooseCardForDuel(gameId: string, playerId: string, cardCode: string) {
	return api(`/game/${encodeURIComponent(gameId)}/duel/choose-card`, {
		method: 'POST',
		body: JSON.stringify({ playerId, cardCode })
	});
}
export async function chooseAttributeForDuel(
	gameId: string,
	playerId: string,
	attribute: 'magic' | 'might' | 'fire'
) {
	return api(`/game/${encodeURIComponent(gameId)}/duel/choose-attribute`, {
		method: 'POST',
		body: JSON.stringify({ playerId, attribute })
	});
}
export async function unchooseCardForDuel(gameId: string, playerId: string) {
	return api(`/game/${encodeURIComponent(gameId)}/duel/unchoose-card`, {
		method: 'POST',
		body: JSON.stringify({ playerId })
	});
}
export async function advanceDuel(gameId: string) {
	return api(`/game/${encodeURIComponent(gameId)}/duel/advance`, { method: 'POST' });
}
export async function advanceDuelRound(gameId: string) {
	return api(`/game/${encodeURIComponent(gameId)}/duel/advance`, { method: 'POST' });
}

/* ---------- Cards ---------- */
const cache = new Map<string, Card>();
export async function getCardMeta(code: string): Promise<Card> {
	if (cache.has(code)) return cache.get(code)!;
	try {
		const raw = await api<RawCard>(`/game/cards/${encodeURIComponent(code)}`);
		const norm = normalizeCard(raw);
		cache.set(code, norm);
		return norm;
	} catch {
		const all = await api<RawCard[]>('/game/cards');
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
		try {
			const qs = encodeURIComponent(missing.join(','));
			const raw = await api<RawCard[]>(`/game/cards?codes=${qs}`);
			for (const r of raw) cache.set(r.code, normalizeCard(r));
		} catch {
			const all = await api<RawCard[]>('/game/cards');
			for (const code of missing) {
				const r = all.find((x) => x.code === code);
				if (r) cache.set(code, normalizeCard(r));
			}
		}
	}
	return codes.map((c) => cache.get(c)!).filter(Boolean);
}

/* ---------- Actives (admin) ---------- */
export async function listActive(token?: string) {
	return api<GameSummary[]>('/game/active', {}, token);
}
export async function listActiveRaw(token?: string) {
	return listActive(token);
}
export async function expireGames(token?: string) {
	return api('/game/expire', { method: 'POST' }, token);
}

/* ---------- Catálogo ---------- */
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
	return api<CardCatalogItem[]>('/game/cards');
}
