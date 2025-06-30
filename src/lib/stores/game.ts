import { writable } from 'svelte/store';

export type GameState = {
	id?: string;
	status: 'idle' | 'running' | 'ended';
	data?: unknown; // trocaremos pelo tipo real depois
};

export const game = writable<GameState>({ status: 'idle' });
