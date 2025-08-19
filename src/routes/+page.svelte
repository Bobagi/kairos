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
			goto(`/game/${gameId}`);
			return;
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	async function newDuelGame() {
		try {
			const { gameId } = await startDuelGame(playerIdInput);
			goto(`/game/${gameId}`);
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

	function goToGame(id: string) {
		goto(`/game/${id}`);
	}

	async function endGame(id: string) {
		try {
			await endGameOnServer(id);
		} catch (e) {
			console.error('Could not end game on server', e);
		}
		await loadAll();
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
								<button class="button button-neutral" on:click={() => goToGame(game.id)}
									>➡️ View</button
								>
								<button class="button button-danger" on:click={() => endGame(game.id)}
									>🗑️ End</button
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

<style>
	:root {
		--bg-1: #ffd944;
		--bg-2: #f7b500;
		--panel-bg: #0f1115;
		--panel-border: #1f2330;
		--muted: #a8b0c0;
		--text: #e6e9f0;
		--accent: #6d5ef5;
		--primary: #ffcc33;
		--danger: #ef4444;
		--neutral: #2a2f3a;
		--shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
	}

	* {
		box-sizing: border-box;
	}

	.page-shell {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: linear-gradient(180deg, var(--bg-1), var(--bg-2));
	}

	.content-panel {
		width: 100%;
		max-width: 980px;
		background: var(--panel-bg);
		color: var(--text);
		border: 1px solid var(--panel-border);
		border-radius: 16px;
		box-shadow: var(--shadow);
		padding: 28px;
	}

	.panel-header {
		text-align: center;
		margin-bottom: 20px;
	}
	.panel-title {
		margin: 0 0 6px 0;
		font-size: 32px;
		line-height: 1.2;
		font-weight: 800;
	}
	.health-text {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
	.mono {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
	}

	.controls-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
		margin-top: 22px;
	}

	.input-wrap {
		display: grid;
		gap: 6px;
	}
	.input-label {
		font-size: 12px;
		color: var(--muted);
	}
	.input-field {
		width: 100%;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--panel-border);
		background: #181b22;
		color: var(--text);
		outline: none;
		transition:
			box-shadow 0.15s,
			border-color 0.15s,
			transform 0.02s;
	}
	.input-field:focus {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px rgba(255, 204, 51, 0.25);
	}

	.actions-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 10px;
		border: 1px solid transparent;
		font-weight: 700;
		font-size: 14px;
		cursor: pointer;
		transition:
			transform 0.02s,
			filter 0.15s,
			background-color 0.15s,
			border-color 0.15s,
			color 0.15s;
		user-select: none;
	}
	.button:active {
		transform: translateY(1px);
	}

	.button-primary {
		background: var(--primary);
		color: #111;
	}
	.button-primary:hover {
		filter: brightness(1.05);
	}

	.button-accent {
		background: var(--accent);
		color: #fff;
	}
	.button-accent:hover {
		filter: brightness(1.05);
	}

	.button-ghost {
		background: transparent;
		border-color: #3a4050;
		color: #ffd38a;
	}
	.button-ghost:hover {
		background: #1a1e27;
	}

	.button-neutral {
		background: var(--neutral);
		color: #fff;
	}
	.button-neutral:hover {
		filter: brightness(1.05);
	}

	.button-danger {
		background: var(--danger);
		color: #fff;
	}
	.button-danger:hover {
		filter: brightness(1.05);
	}

	.games-section {
		margin-top: 26px;
	}
	.section-title {
		margin: 0 0 12px 0;
		font-size: 20px;
		font-weight: 700;
	}

	.games-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.game-card {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
		padding: 14px;
		background: #141821;
		border: 1px solid var(--panel-border);
		border-radius: 12px;
	}
	.game-info {
		display: grid;
		gap: 4px;
	}
	.game-id {
		margin: 0;
		font-size: 13px;
		color: #e9ecf5;
	}
	.game-meta {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.game-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.empty-text {
		color: var(--muted);
		margin: 6px 0 0 0;
	}

	@media (min-width: 768px) {
		.controls-row {
			grid-template-columns: 1fr auto;
			align-items: end;
		}
		.game-card {
			grid-template-columns: 1fr auto;
			align-items: center;
		}
		.panel-title {
			font-size: 36px;
		}
	}
</style>
