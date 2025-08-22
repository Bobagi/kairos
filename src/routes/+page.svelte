<script lang="ts">
	import { goto } from '$app/navigation';
	import type { GameSummary } from '$lib/api/GameClient';
	import {
		endGameOnServer,
		expireGames,
		health,
		listActive,
		listActiveRaw,
		startClassicGame,
		startDuelGame
	} from '$lib/api/GameClient';
	import { onMount } from 'svelte';
	import './mainpage.css';

	let playerIdInput = 'alice';
	let backendHealthMsg = 'Checking API…';
	let activeGames: GameSummary[] = [];

	async function loadAll() {
		try {
			backendHealthMsg = await health();
		} catch (e) {
			backendHealthMsg = (e as Error).message;
		}
		try {
			const raw = await listActiveRaw();
			console.log('Raw active games:', raw);
			activeGames = await listActive();
		} catch (e) {
			console.error('Could not load active games', e);
			activeGames = [];
		}
	}
	onMount(loadAll);

	async function newClassicGame() {
		try {
			const { gameId } = await startClassicGame(playerIdInput);
			goto(`/game/classic/${gameId}`);
			return;
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	async function newDuelGame() {
		try {
			const { gameId } = await startDuelGame(playerIdInput);
			goto(`/game/duel/${gameId}`);
			return;
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	async function expireAndRefresh() {
		try {
			await expireGames();
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	function goToGame(id: string, mode: string) {
		if (mode === 'CLASSIC') goto(`/game/classic/${id}`);
		else if (mode === 'ATTRIBUTE_DUEL' || mode === 'DUEL') goto(`/game/duel/${id}`);
		else goto(`/game/${id}`);
	}
</script>

<div class="page-shell">
	<section class="content-panel">
		<header class="panel-header">
			<h1 class="panel-title">Kairos – Chronos Card Game</h1>
			<p class="health-text">Backend status: <span class="mono">{backendHealthMsg}</span></p>
		</header>

		<div class="controls-row">
			<label class="input-wrap">
				<span class="input-label">Player ID</span>
				<input class="input-field" bind:value={playerIdInput} placeholder="alice" />
			</label>
			<div class="actions-wrap">
				<button class="button button-primary" on:click={newClassicGame}>▶️ Classic</button>
				<button class="button button-accent" on:click={newDuelGame}>⚔️ Duel</button>
				<button class="button button-neutral" on:click={() => goto('/gallery')}>🖼️ Gallery</button>
				<button class="button button-ghost" on:click={expireAndRefresh}>⏳ Expire old games</button>
			</div>
		</div>

		<section class="games-section">
			<h2 class="section-title">Active Games</h2>
			{#if activeGames.length > 0}
				<ul class="games-list">
					{#each activeGames as game}
						<li class="game-card">
							<div class="game-info">
								<p class="game-id mono">{game.id}</p>
								<p class="game-meta">Player A: {game.playerAId} • Mode: <b>{game.mode}</b></p>
							</div>
							<div class="game-actions">
								<button class="button button-neutral" on:click={() => goToGame(game.id, game.mode)}
									>➡️ View</button
								>
								<button
									class="button button-danger"
									on:click={() => endGameOnServer(game.id).then(loadAll)}>🗑️ End</button
								>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-text">No active games.</p>
			{/if}
		</section>
	</section>
</div>
