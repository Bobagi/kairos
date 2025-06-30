const API = import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE;

/**
 * Health-check: chama GET /game/test
 */
export async function health(): Promise<string> {
	const res = await fetch(`${API}/game/test`);
	if (!res.ok) throw new Error(`Health-check failed: ${res.status}`);
	return res.text();
}

/**
 * Inicia uma partida
 */
export async function startGame(playerAId: string): Promise<{ gameId: string }> {
	const res = await fetch(`${API}/game/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerAId })
	});
	if (!res.ok) throw new Error(`Start game failed: ${res.status}`);
	return res.json();
}

/* TODO: implementar quando for usar
export async function playCard(...)
export async function getState(...)
export async function getResult(...)
export async function listActive(...)
export async function expire(...)
*/
