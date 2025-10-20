<script lang="ts">
        import { createEventDispatcher, onDestroy, onMount } from 'svelte';

        import {
                blockChronosPlayer,
                fetchChronosFriendChat,
                listChronosFriendRequests,
                listChronosFriends,
                respondChronosFriendRequest,
                searchChronosPlayers,
                sendChronosFriendMessage,
                sendChronosFriendRequest,
                removeChronosFriend,
                startChronosGameWithFriend,
                type ChronosFriendChatMessage,
                type ChronosFriendSummary,
                type ChronosIncomingFriendRequest,
                type ChronosPlayerSummary,
                type GameMode,
        } from '$lib/api/GameClient';

        const dispatch = createEventDispatcher<{
                close: void;
                navigateToGame: { gameId: string; mode: GameMode };
                refreshDashboard: void;
        }>();

        export let token: string;
        export let currentUserId: string;

        let friends: ChronosFriendSummary[] = [];
        let requests: ChronosIncomingFriendRequest[] = [];
        let searchTerm = '';
        let searchResults: ChronosPlayerSummary[] = [];
        let searchInFlight = false;
        let loadError: string | null = null;
        type PanelNotice = {
                text: string;
                tone: 'info' | 'success' | 'warning' | 'error';
        };

        let persistentNotice: PanelNotice | null = null;
        let ephemeralNotice: PanelNotice | null = null;
        let ephemeralNoticeTimer: ReturnType<typeof setTimeout> | null = null;
        let selectedFriendshipId: string | null = null;
        let chatMessages: ChronosFriendChatMessage[] = [];
        let chatLoading = false;
        let chatMessageDraft = '';

        function scheduleEphemeralNotice(notice: PanelNotice) {
                if (ephemeralNoticeTimer) {
                        clearTimeout(ephemeralNoticeTimer);
                        ephemeralNoticeTimer = null;
                }
                ephemeralNotice = notice;
                ephemeralNoticeTimer = setTimeout(() => {
                        ephemeralNotice = null;
                        ephemeralNoticeTimer = null;
                }, 3400);
        }

        function interpretFriendServiceError(
                error: unknown,
                fallback: string,
                defaultTone: PanelNotice['tone'] = 'error',
        ): PanelNotice {
                const rawMessage =
                        error instanceof Error
                                ? error.message
                                : typeof error === 'string'
                                        ? error
                                        : error
                                                ? JSON.stringify(error)
                                                : '';
                const normalized = rawMessage.toLowerCase();

                if (/p2021/.test(normalized) || /friendship/.test(normalized)) {
                        return {
                                text: 'Chronos backend is missing the friendship tables. Execute the latest Prisma migrations in Chronos (e.g. pnpm prisma migrate deploy) and seed the database before testing the friends features.',
                                tone: 'warning',
                        };
                }

                if (/unauthorized/.test(normalized) || /401/.test(normalized)) {
                        return {
                                text: 'Your Chronos session expired. Please sign in again to manage friends.',
                                tone: 'warning',
                        };
                }

                return { text: fallback, tone: defaultTone };
        }

        function announceFriendServiceIssue(
                error: unknown,
                fallback: string,
                defaultTone: PanelNotice['tone'] = 'error',
        ) {
                const notice = interpretFriendServiceError(error, fallback, defaultTone);
                if (notice.tone === 'warning') {
                        persistentNotice = notice;
                } else {
                        scheduleEphemeralNotice(notice);
                }
        }

        onDestroy(() => {
                if (ephemeralNoticeTimer) {
                        clearTimeout(ephemeralNoticeTimer);
                        ephemeralNoticeTimer = null;
                }
        });

        async function loadInitialData() {
                if (!token) return;
                try {
                        const [friendList, requestList] = await Promise.all([
                                listChronosFriends(token),
                                listChronosFriendRequests(token),
                        ]);
                        friends = friendList;
                        requests = requestList;
                        reselectFriendship();
                        persistentNotice = null;
                        loadError = null;
                } catch (error) {
                        console.error('Failed to load friends data', error);
                        const notice = interpretFriendServiceError(error, 'Unable to load friend data.');
                        if (notice.tone === 'error') {
                                loadError = notice.text;
                        } else {
                                loadError = null;
                                persistentNotice = notice;
                        }
                }
        }

        function reselectFriendship() {
                if (!selectedFriendshipId) {
                        chatMessages = [];
                        return;
                }
                const next = friends.find((f) => f.friendshipId === selectedFriendshipId) ?? null;
                if (!next || next.status !== 'ACCEPTED' || next.blockedByMe) {
                        selectedFriendshipId = null;
                        chatMessages = [];
                        return;
                }
                void loadChatFor(next.friend.id);
        }

        onMount(async () => {
                await loadInitialData();
        });

        async function searchPlayers() {
                if (!token) return;
                const term = searchTerm.trim();
                if (!term) {
                        searchResults = [];
                        return;
                }
                searchInFlight = true;
                try {
                        searchResults = await searchChronosPlayers(term, token);
                } catch (error) {
                        console.error('Search failed', error);
                        announceFriendServiceIssue(error, 'Failed to search players.');
                } finally {
                        searchInFlight = false;
                }
        }

        async function sendRequest(targetId: string) {
                if (!token) return;
                try {
                        await sendChronosFriendRequest(targetId, token);
                        await loadInitialData();
                        scheduleEphemeralNotice({ text: 'Friend request sent.', tone: 'success' });
                } catch (error) {
                        console.error('Failed to send friend request', error);
                        announceFriendServiceIssue(error, 'Unable to send friend request.');
                }
        }

        async function handleRequestResponse(friendshipId: string, accept: boolean) {
                if (!token) return;
                try {
                        await respondChronosFriendRequest(friendshipId, accept, token);
                        await loadInitialData();
                        dispatch('refreshDashboard');
                        scheduleEphemeralNotice({
                                text: accept ? 'Friend request accepted.' : 'Friend request dismissed.',
                                tone: 'success',
                        });
                } catch (error) {
                        console.error('Failed to resolve friend request', error);
                        announceFriendServiceIssue(error, 'Unable to resolve friend request.');
                }
        }

        async function removeFriend(friendshipId: string) {
                if (!token) return;
                try {
                        await removeChronosFriend(friendshipId, token);
                        if (selectedFriendshipId === friendshipId) {
                                selectedFriendshipId = null;
                                chatMessages = [];
                        }
                        await loadInitialData();
                        dispatch('refreshDashboard');
                        scheduleEphemeralNotice({ text: 'Friend removed.', tone: 'info' });
                } catch (error) {
                        console.error('Failed to remove friend', error);
                        announceFriendServiceIssue(error, 'Unable to remove friend.');
                }
        }

        async function blockFriend(targetId: string) {
                if (!token) return;
                try {
                        await blockChronosPlayer(targetId, token);
                        if (selectedFriendshipId) {
                                const active = friends.find((f) => f.friendshipId === selectedFriendshipId);
                                if (active && active.friend.id === targetId) {
                                        selectedFriendshipId = null;
                                        chatMessages = [];
                                }
                        }
                        await loadInitialData();
                        dispatch('refreshDashboard');
                        scheduleEphemeralNotice({ text: 'Player blocked.', tone: 'info' });
                } catch (error) {
                        console.error('Failed to block player', error);
                        announceFriendServiceIssue(error, 'Unable to block player.');
                }
        }

        async function loadChatFor(friendId: string) {
                if (!token) return;
                chatLoading = true;
                try {
                        const history = await fetchChronosFriendChat(friendId, token);
                        selectedFriendshipId = history.friendshipId;
                        chatMessages = history.messages ?? [];
                } catch (error) {
                        console.error('Failed to fetch chat history', error);
                        announceFriendServiceIssue(error, 'Unable to load chat history.');
                } finally {
                        chatLoading = false;
                }
        }

        function selectFriend(friendship: ChronosFriendSummary) {
                if (friendship.status !== 'ACCEPTED' || friendship.blockedByMe) {
                        selectedFriendshipId = null;
                        chatMessages = [];
                        return;
                }
                void loadChatFor(friendship.friend.id);
        }

        async function sendChatMessage(friendship: ChronosFriendSummary) {
                if (!token) return;
                const trimmed = chatMessageDraft.trim();
                if (!trimmed || friendship.status !== 'ACCEPTED' || friendship.blockedByMe) return;
                try {
                        const message = await sendChronosFriendMessage(friendship.friend.id, trimmed, token);
                        chatMessages = [...chatMessages, message];
                        chatMessageDraft = '';
                } catch (error) {
                        console.error('Failed to send chat message', error);
                        announceFriendServiceIssue(error, 'Unable to send message.');
                }
        }

        async function startFriendMatch(friendship: ChronosFriendSummary, mode: GameMode) {
                if (!token || friendship.status !== 'ACCEPTED' || friendship.blockedByMe) return;
                try {
                        const { gameId } = await startChronosGameWithFriend(friendship.friend.id, mode, token);
                        dispatch('navigateToGame', { gameId, mode });
                        dispatch('refreshDashboard');
                        scheduleEphemeralNotice({ text: 'Match created.', tone: 'success' });
                } catch (error) {
                        console.error('Failed to start friend match', error);
                        announceFriendServiceIssue(error, 'Unable to start match with friend.');
                }
        }

        function formatRequestTimestamp(value: string) {
                const parsed = Number(new Date(value));
                if (Number.isNaN(parsed)) return '';
                return new Date(parsed).toLocaleString();
        }

        $: selectedFriendship = selectedFriendshipId
                ? friends.find((f) => f.friendshipId === selectedFriendshipId) ?? null
                : null;

        const isSelf = (playerId: string) => playerId === currentUserId;
</script>

<div class="friends-overlay" role="dialog" aria-modal="true">
        <div class="friends-panel">
                <header class="friends-header">
                        <h2>Allies & Rivals</h2>
                        <button type="button" class="button button-ghost small" on:click={() => dispatch('close')} aria-label="Close friends panel">
                                ✕ Close
                        </button>
                </header>

                {#if loadError}
                        <div class="notice-banner error">{loadError}</div>
                {/if}
                {#if persistentNotice}
                        <div class={`notice-banner ${persistentNotice.tone}`}>{persistentNotice.text}</div>
                {/if}
                {#if ephemeralNotice}
                        <div class={`notice-banner ephemeral ${ephemeralNotice.tone}`}>{ephemeralNotice.text}</div>
                {/if}

                <div class="panel-grid">
                        <div class="column column-left">
                                <section class="card">
                                        <div class="card-header">
                                                <h3>Search players</h3>
                                                <p class="card-hint">Challenge someone new or send a request.</p>
                                        </div>
                                        <form class="search-form" on:submit|preventDefault={searchPlayers}>
                                                <input
                                                        type="search"
                                                        placeholder="Search usernames"
                                                        bind:value={searchTerm}
                                                        aria-label="Search players"
                                                />
                                                <button type="submit" class="button button-accent" disabled={searchInFlight}>Search</button>
                                        </form>
                                        {#if searchInFlight}
                                                <div class="hint">Searching…</div>
                                        {:else if searchResults.length === 0 && searchTerm.trim()}
                                                <div class="hint">No players found.</div>
                                        {:else if searchResults.length > 0}
                                                <ul class="list">
                                                        {#each searchResults as user}
                                                                <li class="list-item">
                                                                        <div class="list-primary">
                                                                                <strong>{user.username}</strong>
                                                                                {#if isSelf(user.id)}
                                                                                        <span class="status-pill neutral">You</span>
                                                                                {/if}
                                                                        </div>
                                                                        <button
                                                                                type="button"
                                                                                class="button button-accent small"
                                                                                disabled={isSelf(user.id)}
                                                                                on:click={() => sendRequest(user.id)}
                                                                        >
                                                                                Send request
                                                                        </button>
                                                                </li>
                                                        {/each}
                                                </ul>
                                        {/if}
                                </section>

                                <section class="card">
                                        <div class="card-header">
                                                <h3>Incoming requests</h3>
                                                <p class="card-hint">Respond to challengers awaiting your answer.</p>
                                        </div>
                                        {#if requests.length === 0}
                                                <div class="hint">No pending requests.</div>
                                        {:else}
                                                <ul class="list">
                                                        {#each requests as request}
                                                                <li class="list-item">
                                                                        <div class="list-primary">
                                                                                <strong>{request.requester.username}</strong>
                                                                                <span class="status-pill neutral">{formatRequestTimestamp(request.createdAt)}</span>
                                                                        </div>
                                                                        <div class="button-row">
                                                                                <button
                                                                                        type="button"
                                                                                        class="button button-accent small"
                                                                                        on:click={() => handleRequestResponse(request.friendshipId, true)}
                                                                                >
                                                                                        Accept
                                                                                </button>
                                                                                <button
                                                                                        type="button"
                                                                                        class="button button-ghost small"
                                                                                        on:click={() => handleRequestResponse(request.friendshipId, false)}
                                                                                >
                                                                                        Dismiss
                                                                                </button>
                                                                        </div>
                                                                </li>
                                                        {/each}
                                                </ul>
                                        {/if}
                                </section>

                                <section class="card">
                                        <div class="card-header">
                                                <h3>Friends roster</h3>
                                                <p class="card-hint">Manage alliances, duels, and rivalries.</p>
                                        </div>
                                        {#if friends.length === 0}
                                                <div class="hint">You have no allies yet. Send a request above.</div>
                                        {:else}
                                                <ul class="list">
                                                        {#each friends as friendship}
                                                                <li class="list-item" class:selected={friendship.friendshipId === selectedFriendshipId}>
                                                                        <div class="list-primary">
                                                                                <strong>{friendship.friend.username}</strong>
                                                                                <div class="status-group">
                                                                                        <span class={`status-pill ${friendship.status === 'ACCEPTED' ? 'success' : friendship.status === 'PENDING' ? 'warning' : 'danger'}`}>
                                                                                                {friendship.status}
                                                                                        </span>
                                                                                        {#if friendship.blockedByMe}
                                                                                                <span class="status-pill danger">Blocked</span>
                                                                                        {/if}
                                                                                </div>
                                                                        </div>
                                                                        <button
                                                                                type="button"
                                                                                class="button button-neutral small"
                                                                                on:click={() => selectFriend(friendship)}
                                                                        >
                                                                                View
                                                                        </button>
                                                                </li>
                                                        {/each}
                                                </ul>
                                        {/if}
                                </section>
                        </div>

                        <div class="column column-right">
                                <section class="card">
                                        <div class="card-header">
                                                <h3>Friend details</h3>
                                                <p class="card-hint">Invite to a battle or manage your connection.</p>
                                        </div>
                                        {#if !selectedFriendship}
                                                <div class="hint">Select a friend to see more options.</div>
                                        {:else}
                                                <div class="friend-detail">
                                                        <h4>{selectedFriendship.friend.username}</h4>
                                                        <div class="status-group">
                                                                <span class={`status-pill ${selectedFriendship.status === 'ACCEPTED' ? 'success' : selectedFriendship.status === 'PENDING' ? 'warning' : 'danger'}`}>
                                                                        {selectedFriendship.status}
                                                                </span>
                                                                {#if selectedFriendship.blockedByMe}
                                                                        <span class="status-pill danger">Blocked</span>
                                                                {/if}
                                                        </div>
                                                        {#if selectedFriendship.status === 'ACCEPTED' && !selectedFriendship.blockedByMe}
                                                                <div class="button-grid">
                                                                        <button
                                                                                type="button"
                                                                                class="button button-accent"
                                                                                on:click={() => startFriendMatch(selectedFriendship, 'CLASSIC')}
                                                                        >
                                                                                Start classic match
                                                                        </button>
                                                                        <button
                                                                                type="button"
                                                                                class="button button-accent"
                                                                                on:click={() => startFriendMatch(selectedFriendship, 'ATTRIBUTE_DUEL')}
                                                                        >
                                                                                Start duel
                                                                        </button>
                                                                        <button
                                                                                type="button"
                                                                                class="button button-neutral"
                                                                                on:click={() => selectFriend(selectedFriendship)}
                                                                        >
                                                                                Open chat
                                                                        </button>
                                                                </div>
                                                        {/if}
                                                        <div class="button-grid secondary">
                                                                <button
                                                                        type="button"
                                                                        class="button button-ghost"
                                                                        on:click={() => removeFriend(selectedFriendship.friendshipId)}
                                                                >
                                                                        Remove friend
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="button button-danger"
                                                                        on:click={() => blockFriend(selectedFriendship.friend.id)}
                                                                >
                                                                        Block player
                                                                </button>
                                                        </div>
                                                </div>
                                        {/if}
                                </section>

                                <section class="card chat-card">
                                        <div class="card-header">
                                                <h3>Friend chat</h3>
                                                <p class="card-hint">Exchange messages with your allies.</p>
                                        </div>
                                        {#if !selectedFriendship}
                                                <div class="hint">Pick a friend from the roster to view your chat history.</div>
                                        {:else}
                                                <div class="chat-panel">
                                                        {#if chatLoading}
                                                                <div class="hint">Loading chat…</div>
                                                        {:else if chatMessages.length === 0}
                                                                <div class="hint">No messages yet.</div>
                                                        {:else}
                                                                <ul class="chat-list">
                                                                        {#each chatMessages as message}
                                                                                <li class:mine={message.senderId === currentUserId}>
                                                                                        <div class="bubble">
                                                                                                <p>{message.body}</p>
                                                                                                <span class="timestamp">{new Date(message.createdAt).toLocaleString()}</span>
                                                                                        </div>
                                                                                </li>
                                                                        {/each}
                                                                </ul>
                                                        {/if}

                                                        <form
                                                                class="chat-form"
                                                                on:submit|preventDefault={() => selectedFriendship && sendChatMessage(selectedFriendship)}
                                                        >
                                                                <input
                                                                        type="text"
                                                                        placeholder="Type a message"
                                                                        bind:value={chatMessageDraft}
                                                                        disabled={!selectedFriendship || selectedFriendship.blockedByMe}
                                                                />
                                                                <button
                                                                        type="submit"
                                                                        class="button button-accent"
                                                                        disabled={!chatMessageDraft.trim() || !selectedFriendship || selectedFriendship.blockedByMe}
                                                                >
                                                                        Send
                                                                </button>
                                                        </form>
                                                </div>
                                        {/if}
                                </section>
                        </div>
                </div>
        </div>
</div>

<style>
        .friends-overlay {
                position: fixed;
                inset: 0;
                background: rgba(7, 10, 18, 0.82);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: clamp(16px, 4vw, 40px);
                z-index: 1000;
        }

        .friends-panel {
                width: min(1024px, 100%);
                max-height: 92vh;
                overflow-y: auto;
                background: linear-gradient(160deg, rgba(15, 23, 42, 0.92), rgba(9, 13, 24, 0.88));
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 20px;
                padding: clamp(22px, 4vw, 36px);
                box-shadow: 0 30px 60px rgba(2, 6, 14, 0.6);
                color: #eef2ff;
                backdrop-filter: blur(10px) saturate(1.2);
        }

        .friends-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                margin-bottom: 18px;
        }

        .friends-header h2 {
                margin: 0;
                font-size: clamp(1.5rem, 3.2vw, 1.9rem);
                letter-spacing: 0.08em;
                text-transform: uppercase;
        }

        .panel-grid {
                display: grid;
                grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
                gap: clamp(16px, 3vw, 24px);
        }

        .column {
                display: flex;
                flex-direction: column;
                gap: clamp(14px, 2.5vw, 20px);
        }

        .card {
                background: rgba(12, 18, 32, 0.78);
                border: 1px solid rgba(148, 163, 184, 0.22);
                border-radius: 18px;
                padding: clamp(16px, 2.8vw, 22px);
                box-shadow: 0 18px 40px rgba(2, 6, 14, 0.38);
                display: flex;
                flex-direction: column;
                gap: clamp(12px, 2vw, 18px);
        }

        .card-header h3 {
                margin: 0;
                font-size: clamp(1.05rem, 2.4vw, 1.3rem);
                letter-spacing: 0.04em;
                text-transform: uppercase;
        }

        .card-hint {
                margin: 4px 0 0;
                font-size: 0.85rem;
                color: rgba(199, 210, 254, 0.75);
        }

        .search-form {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
        }

        input[type='search'],
        input[type='text'] {
                flex: 1 1 220px;
                min-width: 0;
                padding: 10px 12px;
                border-radius: 12px;
                border: 1px solid rgba(148, 163, 184, 0.3);
                background: rgba(9, 13, 24, 0.92);
                color: inherit;
                font-size: 0.95rem;
        }

        input[type='search']:focus,
        input[type='text']:focus {
                outline: none;
                border-color: rgba(129, 199, 255, 0.65);
                box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
        }

        .button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 16px;
                border-radius: 999px;
                border: 1px solid transparent;
                font-weight: 600;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                font-size: 0.82rem;
                cursor: pointer;
                transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, border-color 0.2s ease;
                color: #eef2ff;
                background: rgba(30, 41, 59, 0.85);
        }

        .button:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 8px 20px rgba(15, 23, 42, 0.45);
        }

        .button:disabled {
                opacity: 0.55;
                cursor: not-allowed;
        }

        .button.small {
                padding: 6px 12px;
                border-radius: 14px;
        }

        .button-accent {
                background: linear-gradient(160deg, rgba(56, 189, 248, 0.95), rgba(59, 130, 246, 0.95));
                border-color: rgba(148, 197, 255, 0.45);
                color: #0f172a;
        }

        .button-accent:hover:not(:disabled) {
                box-shadow: 0 10px 28px rgba(56, 189, 248, 0.4);
        }

        .button-ghost {
                background: transparent;
                border-color: rgba(148, 163, 184, 0.45);
                color: rgba(224, 231, 255, 0.9);
        }

        .button-ghost:hover:not(:disabled) {
                background: rgba(148, 163, 184, 0.12);
        }

        .button-neutral {
                background: rgba(63, 81, 181, 0.32);
                border-color: rgba(129, 140, 248, 0.45);
        }

        .button-danger {
                background: linear-gradient(160deg, rgba(239, 68, 68, 0.92), rgba(185, 28, 28, 0.92));
                border-color: rgba(248, 113, 113, 0.6);
        }

        .notice-banner {
                margin-bottom: 14px;
                padding: 12px 16px;
                border-radius: 14px;
                border: 1px solid rgba(148, 163, 184, 0.25);
                background: rgba(30, 41, 59, 0.75);
                font-size: 0.9rem;
        }

        .notice-banner.warning {
                border-color: rgba(250, 204, 21, 0.65);
                background: rgba(251, 191, 36, 0.16);
                color: #fcd34d;
        }

        .notice-banner.success {
                border-color: rgba(16, 185, 129, 0.55);
                background: rgba(16, 185, 129, 0.16);
                color: #6ee7b7;
        }

        .notice-banner.error {
                border-color: rgba(239, 68, 68, 0.55);
                background: rgba(239, 68, 68, 0.18);
                color: #fecaca;
        }

        .notice-banner.info {
                border-color: rgba(59, 130, 246, 0.55);
                background: rgba(59, 130, 246, 0.18);
                color: #bfdbfe;
        }

        .notice-banner.ephemeral {
                animation: float-in 0.32s ease;
        }

        @keyframes float-in {
                from {
                        opacity: 0;
                        transform: translateY(-6px);
                }
                to {
                        opacity: 1;
                        transform: translateY(0);
                }
        }

        .list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 10px;
        }

        .list-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                padding: 12px 14px;
                border-radius: 14px;
                border: 1px solid rgba(59, 72, 99, 0.45);
                background: rgba(11, 16, 27, 0.85);
        }

        .list-item.selected {
                border-color: rgba(96, 165, 250, 0.7);
                box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.35);
        }

        .list-primary {
                display: flex;
                flex-direction: column;
                gap: 6px;
        }

        .status-group {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
        }

        .status-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 10px;
                border-radius: 999px;
                font-size: 0.72rem;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                border: 1px solid transparent;
        }

        .status-pill.success {
                background: rgba(16, 185, 129, 0.22);
                border-color: rgba(16, 185, 129, 0.45);
                color: #a7f3d0;
        }

        .status-pill.warning {
                background: rgba(251, 191, 36, 0.22);
                border-color: rgba(250, 204, 21, 0.45);
                color: #fcd34d;
        }

        .status-pill.danger {
                background: rgba(239, 68, 68, 0.24);
                border-color: rgba(239, 68, 68, 0.45);
                color: #fecaca;
        }

        .status-pill.neutral {
                background: rgba(148, 163, 184, 0.18);
                border-color: rgba(148, 163, 184, 0.35);
                color: rgba(226, 232, 240, 0.9);
        }

        .button-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
        }

        .button-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px;
        }

        .button-grid.secondary {
                margin-top: 8px;
        }

        .hint {
                font-size: 0.86rem;
                color: rgba(199, 210, 254, 0.68);
        }

        .friend-detail {
                display: flex;
                flex-direction: column;
                gap: 12px;
        }

        .friend-detail h4 {
                margin: 0;
                font-size: 1.1rem;
        }

        .chat-panel {
                display: flex;
                flex-direction: column;
                gap: 12px;
        }

        .chat-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 260px;
                overflow-y: auto;
        }

        .chat-list li {
                display: flex;
                justify-content: flex-start;
        }

        .chat-list li.mine {
                justify-content: flex-end;
        }

        .bubble {
                max-width: 70%;
                padding: 10px 12px;
                border-radius: 14px;
                background: linear-gradient(160deg, rgba(56, 189, 248, 0.28), rgba(37, 99, 235, 0.24));
                display: flex;
                flex-direction: column;
                gap: 4px;
                box-shadow: 0 6px 18px rgba(15, 23, 42, 0.35);
        }

        .chat-list li.mine .bubble {
                background: linear-gradient(160deg, rgba(16, 185, 129, 0.32), rgba(4, 120, 87, 0.32));
        }

        .bubble p {
                margin: 0;
        }

        .timestamp {
                font-size: 0.75rem;
                color: rgba(226, 232, 240, 0.72);
        }

        .chat-form {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
        }

        .chat-form input[type='text'] {
                flex: 1 1 240px;
        }

        @media (max-width: 980px) {
                .panel-grid {
                        grid-template-columns: 1fr;
                }

                .button-grid {
                        grid-template-columns: 1fr;
                }
        }

        @media (max-width: 640px) {
                .friends-panel {
                        padding: 18px;
                        border-radius: 16px;
                }

                .friends-header h2 {
                        font-size: 1.35rem;
                }

                .list-item {
                        flex-direction: column;
                        align-items: stretch;
                }

                .button-row,
                .chat-form {
                        width: 100%;
                }

                .button-row {
                        justify-content: flex-start;
                }

                .chat-form input[type='text'] {
                        flex-basis: 100%;
                }
        }
</style>
