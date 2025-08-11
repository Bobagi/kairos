const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE;

/** Helper to fetch JSON with proper errors */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${init?.method ?? 'GET'} ${url} failed (${res.status}): ${body}`);
	}
	return res.json() as Promise<T>;
}

/** ---- Types used by the UI ---- */

export interface GameSummary {
	id: string;
	playerAId: string;
}

export interface GameResult {
	winner: string | null; // null tie or no winner
	log: string[];
}

/** ---- REST calls ---- */

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
