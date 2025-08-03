import { writable } from 'svelte/store';

/** A single card in hand or deck */
export interface Card {
	code: string;
	image: string;
	// you can add other fields here (damage, heal, etc.)
}

/** The shape returned by GET /game/state/:id */
export interface GameState {
	gameId: string;
	players: string[]; // e.g. ['alice','BOT']
	turn: number;
	lastActivity: number;
	winner: string | null;
	hp: Record<string, number>;
	hands: Record<string, string[]>; // now dynamic: hands['alice'] is string[]
	// you can add other fields here, e.g.:
	// hp: Record<string, number>;
	// decks: Record<string, string[]>;
	// log: string[];
}

/** Our Svelte store: either the current GameState or null if not loaded */
export const game = writable<GameState | null>(null);
