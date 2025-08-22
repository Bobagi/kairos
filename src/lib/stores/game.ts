import { writable } from 'svelte/store';

export type GameMode = 'CLASSIC' | 'ATTRIBUTE_DUEL';
export type DuelStage = 'PICK_CARD' | 'PICK_ATTRIBUTE' | 'REVEAL' | 'RESOLVED';

export interface Card {
	code: string;
	name: string;
	description: string;
	image: string;
	damage: number;
	heal: number;
	fire: number;
	might: number;
	magic: number;
	number: number;
}

export interface GameState {
	gameId?: string;
	players: string[];
	turn: number;
	lastActivity: number;
	winner: string | null;
	hp: Record<string, number>;
	hands: Record<string, string[]>;
	decks: Record<string, string[]>;
	log?: string[];

	mode: GameMode;
	duelStage?: DuelStage | null;
	duelCenter?: {
		aCardCode?: string;
		bCardCode?: string;
		chosenAttribute?: 'magic' | 'might' | 'fire';
		revealed?: boolean;
		chooserId?: string;
	} | null;
	discardPiles?: Record<string, string[]> | null;
}

export const game = writable<GameState | null>(null);
