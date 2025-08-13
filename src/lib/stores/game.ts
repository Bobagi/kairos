import { writable } from 'svelte/store';

/** Full metadata for a card used by the UI. */
export interface Card {
	code: string;
	name: string;
	description: string;
	image: string; // keep this for backwards-compat (maps to imageUrl)
	damage: number;
	heal: number;
	fire: number;
	might: number;
	magic: number;
}

/** The shape returned by GET /game/state/:id */
export interface GameState {
	gameId: string;
	players: string[]; // e.g. ['alice','BOT']
	turn: number;
	lastActivity: number;
	winner: string | null;
	hp: Record<string, number>;
	hands: Record<string, string[]>; // hand of a player is an array of card 'code's
	// (you can add decks/log here if your API returns them)
}

/** Our Svelte store: either the current GameState or null if not loaded */
export const game = writable<GameState | null>(null);
