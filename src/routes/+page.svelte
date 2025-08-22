<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type { GameSummary } from '$lib/api/GameClient';
	import {
		endGameOnServer,
		expireGames,
		health,
		listActive,
		login,
		me,
		startClassicGame,
		startDuelGame
	} from '$lib/api/GameClient';
	import { onMount } from 'svelte';
	import './mainpage.css';

	type User = { id: string; username: string; role: 'USER' | 'ADMIN' };

	let token: string | null = null;
	let currentUser: User | null = null;

	// login
	let usernameInput = 'alice';
	let passwordInput = '';
	let loginError: string | null = null;

	// ui
	let backendHealthMsg = 'Checking API…';
	let activeGames: GameSummary[] = [];

	$: isAdmin = currentUser?.role === 'ADMIN';

	async function loadAll() {
		try {
			backendHealthMsg = await health();
		} catch (e) {
			backendHealthMsg = (e as Error).message;
		}

		if (isAdmin && token) {
			try {
				activeGames = await listActive(token);
			} catch (e) {
				console.error('Could not load active games', e);
				activeGames = [];
			}
		} else {
			activeGames = [];
		}
	}

	onMount(async () => {
		if (browser) token = localStorage.getItem('token');
		if (token) {
			try {
				currentUser = await me(token);
			} catch {
				token = null;
				if (browser) localStorage.removeItem('token');
			}
		}
		await loadAll();
	});

	async function doLogin() {
		loginError = null;
		try {
			const r = await login(usernameInput, passwordInput);
			token = r.accessToken;
			currentUser = r.user;
			passwordInput = '';
			if (browser && token) localStorage.setItem('token', token);
		} catch (e) {
			console.error('Login failed', e);
			loginError = 'Invalid username or password.';
		}
		await loadAll();
	}

	function logout() {
		token = null;
		currentUser = null;
		if (browser) localStorage.removeItem('token');
		activeGames = [];
	}

	async function newClassicGame() {
		if (!currentUser) return;
		try {
			const { gameId } = await startClassicGame(currentUser.id);
			goto(`/game/classic/${gameId}`);
			return;
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	async function newDuelGame() {
		if (!currentUser) return;
		try {
			const { gameId } = await startDuelGame(currentUser.id);
			goto(`/game/duel/${gameId}`);
			return;
		} catch (e) {
			console.error(e);
		}
		await loadAll();
	}

	async function expireAndRefresh() {
		if (!isAdmin || !token) return;
		try {
			await expireGames(token);
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

		<!-- Login / Perfil -->
		<div class="controls-row">
			<label class="input-wrap">
				<span class="input-label">Nickname / Username</span>
				<input class="input-field" bind:value={usernameInput} placeholder="alice" />
			</label>

			{#if currentUser}
				<div class="actions-wrap">
					<span class="badge">Hello, <b>{currentUser.username}</b> ({currentUser.role})</span>
					<button class="button button-neutral" on:click={() => goto('/gallery')}>🖼️ Gallery</button
					>
					<button class="button button-ghost" on:click={logout}>Logout</button>
				</div>
			{:else}
				<label class="input-wrap">
					<span class="input-label">Password</span>
					<input
						class="input-field"
						type="password"
						bind:value={passwordInput}
						placeholder="••••••"
					/>
				</label>
				<div class="actions-wrap">
					<button class="button button-accent" on:click={doLogin}>🔐 Login</button>
					<button class="button button-neutral" on:click={() => goto('/gallery')}>🖼️ Gallery</button
					>
				</div>
			{/if}
		</div>

		{#if loginError}
			<p class="empty-text" style="color:#ffbdbd">{loginError}</p>
		{/if}

		<!-- Ações do jogo -->
		<div class="controls-row">
			<div class="actions-wrap">
				{#if currentUser}
					<button class="button button-accent" on:click={newDuelGame}>⚔️ Duel</button>
					<!-- <button class="button button-primary" on:click={newClassicGame}>▶️ Classic</button> -->
				{/if}

				{#if isAdmin}
					<button class="button button-ghost" on:click={expireAndRefresh}
						>⏳ Expire old games</button
					>
				{/if}
			</div>
		</div>

		<!-- Somente admins veem a lista -->
		<section class="games-section">
			<h2 class="section-title">Active Games</h2>

			{#if !isAdmin}
				<p class="empty-text">Only admins can view active games.</p>
			{:else if activeGames.length > 0}
				<ul class="games-list">
					{#each activeGames as game}
						<li class="game-card">
							<div class="game-info">
								<p class="game-id mono">{game.id}</p>
								<p class="game-meta">
									Player: <b>{game.playerAId}</b> • Mode: <b>{game.mode}</b>
								</p>
							</div>
							<div class="game-actions">
								<button
									class="button button-neutral"
									on:click={() => goToGame(game.id, game.mode)}
									title="Go to game"
								>
									➡️ Go to game
								</button>
								<button
									class="button button-danger"
									on:click={() => endGameOnServer(game.id, token!).then(loadAll)}
									title="Finish the game"
								>
									🗑️ Finish
								</button>
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
