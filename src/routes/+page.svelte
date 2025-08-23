<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	import {
		endGameOnServer,
		expireGames,
		health,
		listActive, // admin
		listMyActive, // usuário comum
		login,
		me,
		startClassicGame,
		startDuelGame
	} from '$lib/api/GameClient';
	import './mainpage.css';

	type User = { id: string; username: string; role: 'USER' | 'ADMIN' };

	/* ---- auth state ---- */
	let token: string | null = null;
	let currentUser: User | null = null;

	/* ---- login form ---- */
	let usernameInput = '';
	let passwordInput = '';
	let loginError: string | null = null;

	/* ---- ui/data ---- */
	let backendHealthMsg = 'Checking server…';
	let allActive: any[] = []; // admin – tudo
	let myActive: any[] = []; // só meus jogos
	$: isAdmin = currentUser?.role === 'ADMIN';

	/* ---- helpers ---- */
	function isMine(g: any, myId: string) {
		if (Array.isArray(g?.players)) return g.players.includes(myId);
		if (g?.playerAId) return g.playerAId === myId || g?.playerBId === myId;
		return false;
	}
	function gameIdOf(g: any) {
		return g.id ?? g.gameId ?? '';
	}
	function lastActivityOf(g: any): number | null {
		return typeof g?.lastActivity === 'number' ? g.lastActivity : null;
	}
	function fmtAgo(ts: number | null) {
		if (!ts) return '—';
		const diff = Date.now() - ts;
		const m = Math.round(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.round(m / 60);
		return `${h}h ago`;
	}

	async function loadAll() {
		try {
			backendHealthMsg = await health();
		} catch (e) {
			backendHealthMsg = (e as Error).message;
		}

		myActive = [];
		allActive = [];

		if (!currentUser || !token) return;

		try {
			if (isAdmin) {
				allActive = await listActive(token);
				myActive = allActive.filter((g) => isMine(g, currentUser!.id));
			} else {
				myActive = await listMyActive(token);
			}
		} catch {
			myActive = [];
			allActive = [];
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
			const r = await login(usernameInput.trim(), passwordInput);
			token = r.accessToken;
			currentUser = r.user;
			passwordInput = '';
			if (browser && token) localStorage.setItem('token', token);
			await loadAll();
		} catch (e) {
			console.error('Login failed', e);
			loginError = 'Invalid username or password.';
		}
	}

	function logout() {
		token = null;
		currentUser = null;
		if (browser) localStorage.removeItem('token');
		allActive = [];
		myActive = [];
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
		if (!isAdmin) return;
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

	// avatar
	const AVATAR_PRIMARY = '/avatars/placeholder.png';
	const AVATAR_FALLBACK = 'https://bobagi.click/images/cards/23.png';
	function onAvatarError(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (!img) return;
		img.onerror = null;
		img.src = AVATAR_FALLBACK;
	}

	/* ---- stats mock ---- */
	$: statActive = myActive.length;
	$: statLastUpdated =
		myActive.length > 0 ? fmtAgo(Math.max(...myActive.map((g) => lastActivityOf(g) || 0))) : '—';
	$: statRank = 'Bronze I';
</script>

<div class="page-shell">
	<section class="content-panel">
		<header class="panel-header">
			<h1 class="panel-title">Chronos Card Games</h1>
			<p class="health-text">Server status: <span class="mono">{backendHealthMsg}</span></p>
		</header>

		{#if !currentUser}
			<!-- ========= LOGIN ========= -->
			<form class="controls-col auth-col" on:submit|preventDefault={doLogin}>
				<div class="auth-fields">
					<label class="input-wrap">
						<span class="input-label">Nickname / Username</span>
						<input
							class="input-field"
							bind:value={usernameInput}
							placeholder="User"
							autocomplete="username"
						/>
					</label>
					<label class="input-wrap">
						<span class="input-label">Password</span>
						<input
							class="input-field"
							type="password"
							bind:value={passwordInput}
							placeholder="••••••••••••••••••••••••"
							autocomplete="current-password"
						/>
					</label>
				</div>

				<div class="auth-actions stacked">
					<button class="button button-primary" type="submit">🔐 Login</button>
					<button class="button button-accent" type="button" on:click={() => goto('/gallery')}
						>Gallery</button
					>
					<button class="button button-ghost" type="button" on:click={() => goto('/register')}
						>Create account</button
					>
				</div>
			</form>

			{#if loginError}
				<p class="empty-text" style="color:#ffbdbd">{loginError}</p>
			{/if}
		{:else}
			<!-- ========= PERFIL ========= -->
			<div class="profile-card">
				<div class="avatar-wrap" aria-hidden="true">
					<img src={AVATAR_PRIMARY} alt="User avatar" loading="lazy" on:error={onAvatarError} />
				</div>

				<div class="profile-main">
					<div class="profile-top">
						<div class="user-name">
							<strong>{currentUser.username}</strong>
							{#if isAdmin}
								<span class="role-badge admin">ADMIN</span>
							{/if}
						</div>
						<div class="profile-actions">
							<button class="button button-neutral" on:click={() => goto('/gallery')}
								>🖼️ Gallery</button
							>
							<button class="button button-accent" on:click={() => alert('Friends coming soon!')}
								>👥 Friends</button
							>
							<button class="button button-ghost" on:click={logout}>Logout</button>
						</div>
					</div>

					<div class="stats-grid">
						<div class="stat">
							<div class="stat-num">{statActive}</div>
							<div class="stat-label">Active games</div>
						</div>
						<div class="stat">
							<div class="stat-num">{statRank}</div>
							<div class="stat-label">Rank</div>
						</div>
						<div class="stat">
							<div class="stat-num">{statLastUpdated}</div>
							<div class="stat-label">Last activity</div>
						</div>
					</div>

					<div class="profile-cta">
						<button class="button button-danger" on:click={newDuelGame}>⚔️ Start Duel</button>
						{#if isAdmin}
							<button class="button button-ghost" on:click={expireAndRefresh}
								>⏳ Expire old games</button
							>
						{/if}
					</div>
				</div>
			</div>

			<!-- ========= LISTAS ========= -->
			<section class="games-section">
				<h2 class="section-title">My Active Games</h2>
				{#if myActive.length === 0}
					<p class="empty-text">You have no active games. Start one above!</p>
				{:else}
					<ul class="games-list">
						{#each myActive as g}
							<li class="game-card">
								<div class="game-info">
									<p class="game-id mono">{gameIdOf(g)}</p>
									<p class="game-meta">
										Mode: <b>{g.mode}</b>
										{#if lastActivityOf(g)}
											• Updated: {fmtAgo(lastActivityOf(g))}{/if}
									</p>
								</div>
								<div class="game-actions">
									<button
										class="button button-neutral"
										on:click={() => goToGame(gameIdOf(g), g.mode)}
										title="Open game">➡️ Open</button
									>
									{#if isAdmin}
										<button
											class="button button-danger"
											on:click={() => endGameOnServer(gameIdOf(g)).then(loadAll)}
											title="Finish the game">🗑️ Finish</button
										>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if isAdmin}
				<section class="games-section" style="margin-top:18px">
					<h2 class="section-title">All Active (Admin)</h2>
					{#if allActive.length === 0}
						<p class="empty-text">No active games on server.</p>
					{:else}
						<ul class="games-list">
							{#each allActive as g}
								<li class="game-card">
									<div class="game-info">
										<p class="game-id mono">{gameIdOf(g)}</p>
										<p class="game-meta">
											Mode: <b>{g.mode}</b>
											{#if g.players}
												• Players: {g.players.join(' · ')}{/if}
											{#if lastActivityOf(g)}
												• Updated: {fmtAgo(lastActivityOf(g))}{/if}
										</p>
									</div>
									<div class="game-actions">
										<button
											class="button button-neutral"
											on:click={() => goToGame(gameIdOf(g), g.mode)}>➡️ Open</button
										>
										<button
											class="button button-danger"
											on:click={() => endGameOnServer(gameIdOf(g)).then(loadAll)}>🗑️ Finish</button
										>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		{/if}
	</section>
</div>

<style>
	/* badge ADMIN com cor primária */
	.role-badge.admin {
		background: var(--primary);
		color: #111;
		border-color: rgba(0, 0, 0, 0.08);
	}

	/* força layout em coluna no login */
	.controls-col.auth-col {
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
	}
	.auth-actions.stacked {
		display: grid;
		gap: 10px;
		max-width: 260px;
	}
</style>
