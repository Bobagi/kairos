// src/lib/api/GameClient.ts

const API = import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE;

/** Full, untyped JSON coming back from GET /game/active */
export async function listActiveRaw(): Promise<unknown[]> {
	const res = await fetch(`${API}/game/active`);
	if (!res.ok) throw new Error(`Failed to list active games: ${res.status}`);
	return res.json();
}

/** Basic shape for our UI layer */
export interface GameSummary {
	id: string;
	playerAId: string;
}

/**
 * Fetch raw list, then map into GameSummary[] using
 * raw.gameId and raw.players[0] for Player A.
 */
export async function listActive(): Promise<GameSummary[]> {
	const raw = await listActiveRaw();
	console.log('🔥 raw /game/active response:', raw);

	return raw.map((g: any) => {
		const id: string = typeof g.gameId === 'string' ? g.gameId : JSON.stringify(g);

		const playerAId: string =
			Array.isArray(g.players) && g.players.length > 0 ? g.players[0] : 'unknown';

		return { id, playerAId };
	});
}

/** Health-check GET /game/test */
export async function health(): Promise<string> {
	const res = await fetch(`${API}/game/test`);
	if (!res.ok) throw new Error(`Health-check failed: ${res.status}`);
	return res.text();
}

/** Start game POST /game/start { playerAId } → { gameId } */
export async function startGame(playerAId: string): Promise<{ gameId: string }> {
	const res = await fetch(`${API}/game/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
	if (!res.ok) throw new Error(`Start game failed: ${res.status}`);
	return res.json();
}

/** Expire old games POST /game/expire */
export async function expireGames(): Promise<void> {
	const res = await fetch(`${API}/game/expire`, { method: 'POST' });
	if (!res.ok) throw new Error(`Failed to expire games: ${res.status}`);
}

/** Permanently end one game */
export async function endGameOnServer(gameId: string): Promise<void> {
	const res = await fetch(`${API}/game/end/${gameId}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(`Failed to end game ${gameId}: ${res.status}`);
}
