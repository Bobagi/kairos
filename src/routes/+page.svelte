<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

        import type { GameSummary } from '$lib/api/GameClient';
        import {
                checkChronosHealthStatus,
                endChronosGameSessionOnServer,
                expireInactiveChronosGames,
                fetchAuthenticatedChronosUserProfile,
                fetchMyChronosGameStatistics,
                listAllActiveChronosGames,
                listAuthenticatedChronosPlayerActiveGames,
                loginChronosUserAccount,
                startAttributeDuelChronosGameForPlayer,
                startClassicChronosGameForPlayer
        } from '$lib/api/GameClient';
	import './mainpage.css';

        type AuthenticatedChronosUser = { id: string; username: string; role: 'USER' | 'ADMIN' };
        type ChronosActiveGameSummary = GameSummary & {
                playerBId?: string | null;
                players?: string[] | null;
                lastActivity?: number | null;
        };

        let authenticationToken: string | null = null;
        let authenticatedUser: AuthenticatedChronosUser | null = null;

        let usernameInputValue = '';
        let passwordInputValue = '';
        let loginErrorMessage: string | null = null;

        let backendHealthMessage = 'Checking server…';
        let allActiveChronosGames: ChronosActiveGameSummary[] = [];
        let myActiveChronosGames: ChronosActiveGameSummary[] = [];
        $: isAdmin = authenticatedUser?.role === 'ADMIN';

	/* ---- stats ---- */
	let statGamesPlayed = 0;
	let statGamesWon = 0;
	let statGamesDrawn = 0;

        function isGameOwnedByPlayer(
                gameSummary: ChronosActiveGameSummary,
                playerIdentifier: string
        ) {
                if (Array.isArray(gameSummary?.players)) return gameSummary.players.includes(playerIdentifier);
                if (gameSummary?.playerAId)
                        return (
                                gameSummary.playerAId === playerIdentifier ||
                                gameSummary?.playerBId === playerIdentifier
                        );
                return false;
        }
        function resolveGameIdentifier(gameSummary: ChronosActiveGameSummary) {
                return gameSummary.id ?? (gameSummary as { gameId?: string }).gameId ?? '';
        }
        function resolveLastActivityTimestamp(gameSummary: ChronosActiveGameSummary): number | null {
                return typeof gameSummary?.lastActivity === 'number' ? gameSummary.lastActivity : null;
        }
        function formatRelativeLastActivity(timestamp: number | null) {
                if (!timestamp) return '—';
                const elapsedMilliseconds = Date.now() - timestamp;
                const elapsedMinutes = Math.round(elapsedMilliseconds / 60000);
                if (elapsedMinutes < 1) return 'just now';
                if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
                const elapsedHours = Math.round(elapsedMinutes / 60);
                return `${elapsedHours}h ago`;
        }

        async function loadChronosDashboardData() {
                try {
                        backendHealthMessage = await checkChronosHealthStatus();
                } catch (error) {
                        backendHealthMessage = (error as Error).message;
                }

                myActiveChronosGames = [];
                allActiveChronosGames = [];
                statGamesPlayed = 0;
                statGamesWon = 0;
                statGamesDrawn = 0;

                if (!authenticatedUser || !authenticationToken) return;

                try {
                        if (isAdmin) {
                                allActiveChronosGames = await listAllActiveChronosGames(authenticationToken);
                                myActiveChronosGames = allActiveChronosGames.filter((gameSummary) =>
                                        isGameOwnedByPlayer(gameSummary, authenticatedUser!.id)
                                );
                        } else {
                                myActiveChronosGames = await listAuthenticatedChronosPlayerActiveGames(
                                        authenticationToken
                                );
                        }
                        const statistics = await fetchMyChronosGameStatistics(authenticationToken);
                        statGamesPlayed = statistics.gamesPlayed ?? 0;
                        statGamesWon = statistics.gamesWon ?? 0;
                        statGamesDrawn = statistics.gamesDrawn ?? 0;
                } catch {
                        myActiveChronosGames = [];
                        allActiveChronosGames = [];
                        statGamesPlayed = 0;
                        statGamesWon = 0;
                        statGamesDrawn = 0;
                }
        }

        onMount(async () => {
                if (browser) authenticationToken = localStorage.getItem('token');
                if (authenticationToken) {
                        try {
                                authenticatedUser = await fetchAuthenticatedChronosUserProfile(
                                        authenticationToken
                                );
                        } catch {
                                authenticationToken = null;
                                if (browser) localStorage.removeItem('token');
                        }
                }
                await loadChronosDashboardData();
        });

        async function loginToChronos() {
                loginErrorMessage = null;
                try {
                        const authenticationResponse = await loginChronosUserAccount(
                                usernameInputValue.trim(),
                                passwordInputValue
                        );
                        authenticationToken = authenticationResponse.accessToken;
                        authenticatedUser = authenticationResponse.user;
                        passwordInputValue = '';
                        if (browser && authenticationToken) localStorage.setItem('token', authenticationToken);
                        await loadChronosDashboardData();
                } catch (error) {
                        console.error('Login failed', error);
                        loginErrorMessage = 'Invalid username or password.';
                }
        }

        function logoutFromChronos() {
                authenticationToken = null;
                authenticatedUser = null;
                if (browser) localStorage.removeItem('token');
                allActiveChronosGames = [];
                myActiveChronosGames = [];
                statGamesPlayed = 0;
                statGamesWon = 0;
                statGamesDrawn = 0;
        }

        async function createNewClassicChronosGame() {
                if (!authenticatedUser) return;
                try {
                        const { gameId } = await startClassicChronosGameForPlayer(authenticatedUser.id);
                        goto(`/game/classic/${gameId}`);
                        return;
                } catch (error) {
                        console.error(error);
                }
                await loadChronosDashboardData();
        }

        async function createNewAttributeDuelChronosGame() {
                if (!authenticatedUser) return;
                try {
                        const { gameId } = await startAttributeDuelChronosGameForPlayer(authenticatedUser.id);
                        goto(`/game/duel/${gameId}`);
                        return;
                } catch (error) {
                        console.error(error);
                }
                await loadChronosDashboardData();
        }

        async function expireInactiveChronosGamesAndRefreshDashboard() {
                if (!isAdmin) return;
                try {
                        await expireInactiveChronosGames();
                } catch (error) {
                        console.error(error);
                }
                await loadChronosDashboardData();
        }

        function navigateToChronosGame(gameIdentifier: string, gameMode: string) {
                if (gameMode === 'CLASSIC') goto(`/game/classic/${gameIdentifier}`);
                else if (gameMode === 'ATTRIBUTE_DUEL' || gameMode === 'DUEL')
                        goto(`/game/duel/${gameIdentifier}`);
                else goto(`/game/${gameIdentifier}`);
        }

	const AVATAR_PRIMARY = '/avatars/placeholder.png';
	const AVATAR_FALLBACK = 'https://bobagi.space/images/cards/23.png';
        function onAvatarImageError(event: Event) {
                const imageElement = event.currentTarget as HTMLImageElement;
                if (!imageElement) return;
                imageElement.onerror = null;
                imageElement.src = AVATAR_FALLBACK;
        }

        $: statActive = myActiveChronosGames.length;
        $: statLastUpdated =
                myActiveChronosGames.length > 0
                        ? formatRelativeLastActivity(
                                  Math.max(
                                          ...myActiveChronosGames.map(
                                                  (gameSummary) => resolveLastActivityTimestamp(gameSummary) || 0
                                          )
                                  )
                          )
                        : '—';
	$: statRank = 'Bronze I';
</script>

<svelte:head><title>Chronos</title></svelte:head>

<div class="page-shell">
	<section class="content-panel">
		<header class="panel-header">
			<h1 class="panel-title">Chronos Card Games</h1>
			<p class="health-text">Server status: <span class="mono">{backendHealthMessage}</span></p>
		</header>

		{#if !authenticatedUser}
			<form class="controls-col auth-col" on:submit|preventDefault={loginToChronos}>
				<div class="auth-fields">
					<label class="input-wrap">
						<span class="input-label">Nickname / Username</span>
						<input
							class="input-field"
							bind:value={usernameInputValue}
							placeholder="User"
							autocomplete="username"
						/>
					</label>
					<label class="input-wrap">
						<span class="input-label">Password</span>
						<input
							class="input-field"
							type="password"
							bind:value={passwordInputValue}
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
			{#if loginErrorMessage}<p class="empty-text" style="color:#ffbdbd">{loginErrorMessage}</p>{/if}
		{:else}
			<div class="profile-card">
				<div class="avatar-wrap" aria-hidden="true">
					<img src={AVATAR_PRIMARY} alt="User avatar" loading="lazy" on:error={onAvatarImageError} />
				</div>

				<div class="profile-main">
					<div class="profile-top">
						<div class="user-name">
							<strong>{authenticatedUser.username}</strong>
							{#if isAdmin}<span class="role-badge admin">ADMIN</span>{/if}
						</div>
						<div class="profile-actions">
							<button class="button button-neutral" on:click={() => goto('/gallery')}
								>🖼️ Gallery</button
							>
							<button class="button button-accent" on:click={() => alert('Friends coming soon!')}
								>👥 Friends</button
							>
							<button class="button button-ghost" on:click={logoutFromChronos}>Logout</button>
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
						<div class="stat">
							<div class="stat-num">{statGamesPlayed}</div>
							<div class="stat-label">Games played</div>
						</div>
						<div class="stat">
							<div class="stat-num">{statGamesWon}</div>
							<div class="stat-label">Wins</div>
						</div>
						<div class="stat">
							<div class="stat-num">{statGamesDrawn}</div>
							<div class="stat-label">Draws</div>
						</div>
					</div>

					<div class="profile-cta">
						<button class="button button-danger" on:click={createNewAttributeDuelChronosGame}>⚔️ Start Duel</button>
						{#if isAdmin}
							<button class="button button-ghost" on:click={expireInactiveChronosGamesAndRefreshDashboard}
								>⏳ Expire old games</button
							>
						{/if}
					</div>
				</div>
			</div>

			<section class="games-section">
				<h2 class="section-title">My Active Games</h2>
				{#if myActiveChronosGames.length === 0}
					<p class="empty-text">You have no active games. Start one above!</p>
				{:else}
					<ul class="games-list">
						{#each myActiveChronosGames as g}
							<li class="game-card">
								<div class="game-info">
									<p class="game-id mono">{resolveGameIdentifier(g)}</p>
									<p class="game-meta">
										Mode: <b>{g.mode}</b>{#if resolveLastActivityTimestamp(g)}
											• Updated: {formatRelativeLastActivity(resolveLastActivityTimestamp(g))}{/if}
									</p>
								</div>
								<div class="game-actions">
									<button
										class="button button-neutral"
										on:click={() => navigateToChronosGame(resolveGameIdentifier(g), g.mode)}
										title="Open game">➡️ Open</button
									>
									{#if isAdmin}
										<button
											class="button button-danger"
											on:click={() => endChronosGameSessionOnServer(resolveGameIdentifier(g)).then(loadChronosDashboardData)}
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
					{#if allActiveChronosGames.length === 0}
						<p class="empty-text">No active games on server.</p>
					{:else}
						<ul class="games-list">
							{#each allActiveChronosGames as g}
								<li class="game-card">
									<div class="game-info">
										<p class="game-id mono">{resolveGameIdentifier(g)}</p>
										<p class="game-meta">
											Mode: <b>{g.mode}</b>{#if g.players}
												• Players: {g.players.join(' · ')}{/if}{#if resolveLastActivityTimestamp(g)}
												• Updated: {formatRelativeLastActivity(resolveLastActivityTimestamp(g))}{/if}
										</p>
									</div>
									<div class="game-actions">
										<button
											class="button button-neutral"
											on:click={() => navigateToChronosGame(resolveGameIdentifier(g), g.mode)}>➡️ Open</button
										>
										<button
											class="button button-danger"
											on:click={() => endChronosGameSessionOnServer(resolveGameIdentifier(g)).then(loadChronosDashboardData)}>🗑️ Finish</button
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
	.role-badge.admin {
		background: var(--primary);
		color: #111;
		border-color: rgba(0, 0, 0, 0.08);
	}
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
