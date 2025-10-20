<script lang="ts">
        import { createEventDispatcher, onMount } from 'svelte';

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
        let actionMessage: string | null = null;
        let selectedFriendshipId: string | null = null;
        let chatMessages: ChronosFriendChatMessage[] = [];
        let chatLoading = false;
        let chatMessageDraft = '';

        function showError(message: string) {
                actionMessage = message;
                setTimeout(() => {
                        actionMessage = null;
                }, 3000);
        }

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
                        loadError = null;
                } catch (error) {
                        console.error('Failed to load friends data', error);
                        loadError = 'Unable to load friend data.';
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
                        showError('Failed to search players.');
                } finally {
                        searchInFlight = false;
                }
        }

        async function sendRequest(targetId: string) {
                if (!token) return;
                try {
                        await sendChronosFriendRequest(targetId, token);
                        await loadInitialData();
                        showError('Friend request sent.');
                } catch (error) {
                        console.error('Failed to send friend request', error);
                        showError('Unable to send friend request.');
                }
        }

        async function handleRequestResponse(friendshipId: string, accept: boolean) {
                if (!token) return;
                try {
                        await respondChronosFriendRequest(friendshipId, accept, token);
                        await loadInitialData();
                        dispatch('refreshDashboard');
                        showError(accept ? 'Friend request accepted.' : 'Friend request dismissed.');
                } catch (error) {
                        console.error('Failed to resolve friend request', error);
                        showError('Unable to resolve friend request.');
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
                        showError('Friend removed.');
                } catch (error) {
                        console.error('Failed to remove friend', error);
                        showError('Unable to remove friend.');
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
                        showError('Player blocked.');
                } catch (error) {
                        console.error('Failed to block player', error);
                        showError('Unable to block player.');
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
                        showError('Unable to load chat history.');
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
                        showError('Unable to send message.');
                }
        }

        async function startFriendMatch(friendship: ChronosFriendSummary, mode: GameMode) {
                if (!token || friendship.status !== 'ACCEPTED' || friendship.blockedByMe) return;
                try {
                        const { gameId } = await startChronosGameWithFriend(friendship.friend.id, mode, token);
                        dispatch('navigateToGame', { gameId, mode });
                        dispatch('refreshDashboard');
                } catch (error) {
                        console.error('Failed to start friend match', error);
                        showError('Unable to start match with friend.');
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
                        <h2>Friends</h2>
                        <button type="button" class="close-button" on:click={() => dispatch('close')} aria-label="Close">
                                ✕
                        </button>
                </header>

                {#if loadError}
                        <div class="feedback feedback-error">{loadError}</div>
                {:else if actionMessage}
                        <div class="feedback">{actionMessage}</div>
                {/if}

                <section class="friends-section">
                        <h3>Search players</h3>
                        <form
                                class="search-form"
                                on:submit|preventDefault={searchPlayers}
                        >
                                <input
                                        type="search"
                                        placeholder="Search usernames"
                                        bind:value={searchTerm}
                                        aria-label="Search players"
                                />
                                <button type="submit" disabled={searchInFlight}>Search</button>
                        </form>
                        {#if searchInFlight}
                                <div class="hint">Searching…</div>
                        {:else if searchResults.length === 0 && searchTerm.trim()}
                                <div class="hint">No players found.</div>
                        {:else if searchResults.length > 0}
                                <ul class="list">
                                        {#each searchResults as user}
                                                <li>
                                                        <div>
                                                                <strong>{user.username}</strong>
                                                                {#if isSelf(user.id)}
                                                                        <span class="hint">(You)</span>
                                                                {/if}
                                                        </div>
                                                        <button
                                                                type="button"
                                                                class="small-button"
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

                <section class="friends-section">
                        <h3>Incoming requests</h3>
                        {#if requests.length === 0}
                                <div class="hint">No pending requests.</div>
                        {:else}
                                <ul class="list">
                                        {#each requests as request}
                                                <li>
                                                        <div>
                                                                <strong>{request.requester.username}</strong>
                                                                <span class="hint">{formatRequestTimestamp(request.createdAt)}</span>
                                                        </div>
                                                        <div class="inline-buttons">
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => handleRequestResponse(request.friendshipId, true)}
                                                                >
                                                                        Accept
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
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

                <section class="friends-section">
                        <h3>Friends</h3>
                        {#if friends.length === 0}
                                <div class="hint">No friends yet.</div>
                        {:else}
                                <ul class="list">
                                        {#each friends as friendship}
                                                <li class:selected={friendship.friendshipId === selectedFriendshipId}>
                                                        <div>
                                                                <strong>{friendship.friend.username}</strong>
                                                                <span class="hint">{friendship.status}</span>
                                                                {#if friendship.blockedByMe}
                                                                        <span class="hint">(blocked)</span>
                                                                {/if}
                                                        </div>
                                                        <div class="inline-buttons">
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => selectFriend(friendship)}
                                                                        disabled={friendship.status !== 'ACCEPTED' || friendship.blockedByMe}
                                                                >
                                                                        Chat
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => startFriendMatch(friendship, 'CLASSIC')}
                                                                        disabled={friendship.status !== 'ACCEPTED' || friendship.blockedByMe}
                                                                >
                                                                        Classic
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => startFriendMatch(friendship, 'ATTRIBUTE_DUEL')}
                                                                        disabled={friendship.status !== 'ACCEPTED' || friendship.blockedByMe}
                                                                >
                                                                        Duel
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => removeFriend(friendship.friendshipId)}
                                                                >
                                                                        Remove
                                                                </button>
                                                                <button
                                                                        type="button"
                                                                        class="small-button"
                                                                        on:click={() => blockFriend(friendship.friend.id)}
                                                                >
                                                                        Block
                                                                </button>
                                                        </div>
                                                </li>
                                        {/each}
                                </ul>
                        {/if}
                </section>

                <section class="friends-section">
                        <h3>Friend chat</h3>
                        {#if !selectedFriendship}
                                <div class="hint">Select a friend to view your chat history.</div>
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
                width: min(960px, 100%);
                max-height: 90vh;
                overflow-y: auto;
                background: rgba(16, 20, 30, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 18px;
                padding: clamp(20px, 4vw, 32px);
                box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
                color: #f5f6f9;
                backdrop-filter: blur(6px) saturate(1.1);
        }

        .friends-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
        }

        .friends-header h2 {
                margin: 0;
                font-size: clamp(1.4rem, 3vw, 1.8rem);
                letter-spacing: 0.04em;
        }

        .close-button {
                background: transparent;
                border: 0;
                color: inherit;
                font-size: 1.4rem;
                cursor: pointer;
                border-radius: 50%;
                width: 36px;
                height: 36px;
        }

        .close-button:hover {
                background: rgba(255, 255, 255, 0.12);
        }

        .friends-section {
                margin-top: clamp(14px, 2vw, 24px);
                padding-top: clamp(12px, 2vw, 18px);
                border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .friends-section h3 {
                margin: 0 0 10px;
                font-size: clamp(1rem, 2.5vw, 1.2rem);
        }

        .search-form {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
        }

        input[type='search'],
        input[type='text'] {
                flex: 1 1 220px;
                min-width: 0;
                padding: 8px 10px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.16);
                background: rgba(12, 16, 26, 0.8);
                color: inherit;
        }

        button {
                background: rgba(45, 131, 201, 0.85);
                border: 0;
                color: #f5f6f9;
                padding: 8px 14px;
                border-radius: 8px;
                cursor: pointer;
        }

        button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
        }

        .small-button {
                padding: 6px 10px;
                font-size: 0.85rem;
        }

        .inline-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
        }

        .list {
                list-style: none;
                margin: 10px 0 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
        }

        .list li {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 10px;
                background: rgba(14, 18, 28, 0.75);
                border: 1px solid transparent;
        }

        .list li.selected {
                border-color: rgba(76, 170, 255, 0.45);
                background: rgba(23, 39, 61, 0.85);
        }

        .hint {
                font-size: 0.85rem;
                color: rgba(220, 232, 255, 0.72);
        }

        .feedback {
                margin-top: 8px;
                padding: 10px 12px;
                border-radius: 8px;
                background: rgba(46, 125, 50, 0.2);
                color: #cdebd0;
        }

        .feedback-error {
                background: rgba(176, 0, 32, 0.2);
                color: #f7c9ce;
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
                max-height: 240px;
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
                padding: 8px 10px;
                border-radius: 10px;
                background: rgba(35, 110, 190, 0.4);
                display: flex;
                flex-direction: column;
                gap: 4px;
        }

        .chat-list li.mine .bubble {
                background: rgba(72, 192, 120, 0.35);
        }

        .bubble p {
                margin: 0;
        }

        .timestamp {
                font-size: 0.75rem;
                color: rgba(230, 236, 245, 0.7);
        }

        .chat-form {
                display: flex;
                gap: 8px;
        }

        @media (max-width: 720px) {
                .list li {
                        flex-direction: column;
                        align-items: stretch;
                }

                .inline-buttons {
                        justify-content: flex-start;
                }

                .bubble {
                        max-width: 100%;
                }
        }
</style>
