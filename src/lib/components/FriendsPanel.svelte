<script lang="ts">
        import { browser } from '$app/environment';
        import { goto } from '$app/navigation';
        import { createEventDispatcher, onDestroy } from 'svelte';

        import type {
                ChronosChatMessage,
                ChronosFriendRequest,
                ChronosFriendSummary,
                GameMode
        } from '$lib/api/GameClient';
        import {
                acceptChronosFriendRequest,
                blockChronosPlayer,
                fetchChronosFriendChat,
                listChronosFriendRequests,
                listChronosFriends,
                rejectChronosFriendRequest,
                removeChronosFriend,
                searchChronosPlayers,
                sendChronosFriendChatMessage,
                sendChronosFriendRequest,
                startChronosGameWithFriend
        } from '$lib/api/GameClient';

        const dispatch = createEventDispatcher<{ closed: void }>();

        export let token: string | null = null;
        export let open = false;
        export let username = '';

        let loadingFriends = false;
        let loadingRequests = false;
        let searchLoading = false;
        let chatLoading = false;
        let inviteStates = new Map<string, 'idle' | 'pending' | 'success' | 'error'>();
        let friends: ChronosFriendSummary[] = [];
        let requests: ChronosFriendRequest[] = [];
        let searchQuery = '';
        let searchResults: ChronosFriendSummary[] = [];
        let searchError: string | null = null;
        let selectedFriendId: string | null = null;
        let chatMessages: ChronosChatMessage[] = [];
        let chatInputValue = '';
        let chatError: string | null = null;
        let refreshInterval: ReturnType<typeof setInterval> | null = null;

        function closePanel() {
                dispatch('closed');
        }

        function resetPanelState() {
                selectedFriendId = null;
                chatMessages = [];
                chatInputValue = '';
                chatError = null;
        }

        async function refreshFriends() {
                if (!token) return;
                loadingFriends = true;
                try {
                        friends = await listChronosFriends(token);
                } catch (error) {
                        console.error('Failed to load friends', error);
                        friends = [];
                } finally {
                        loadingFriends = false;
                }
        }

        async function refreshRequests() {
                if (!token) return;
                loadingRequests = true;
                try {
                        requests = await listChronosFriendRequests(token);
                } catch (error) {
                        console.error('Failed to load friend requests', error);
                        requests = [];
                } finally {
                        loadingRequests = false;
                }
        }

        async function initializePanel() {
                if (!token) return;
                await Promise.all([refreshFriends(), refreshRequests()]);
                if (refreshInterval) clearInterval(refreshInterval);
                refreshInterval = setInterval(() => {
                        if (!token) return;
                        void refreshFriends();
                        void refreshRequests();
                        if (selectedFriendId) void loadChat(selectedFriendId, false);
                }, 15000);
        }

        async function executeSearch() {
                searchError = null;
                if (!token || !searchQuery.trim()) {
                        searchResults = [];
                        return;
                }
                searchLoading = true;
                try {
                        searchResults = await searchChronosPlayers(searchQuery.trim(), token);
                } catch (error) {
                        console.error('Friend search failed', error);
                        searchError = 'Unable to search players right now.';
                        searchResults = [];
                } finally {
                        searchLoading = false;
                }
        }

        async function sendFriendRequest(targetId: string) {
                if (!token || !targetId) return;
                try {
                        await sendChronosFriendRequest(targetId, token);
                        await refreshRequests();
                } catch (error) {
                        console.error('Failed to send request', error);
                }
        }

        async function acceptRequest(requestId: string) {
                if (!token || !requestId) return;
                try {
                        await acceptChronosFriendRequest(requestId, token);
                        await Promise.all([refreshFriends(), refreshRequests()]);
                } catch (error) {
                        console.error('Failed to accept request', error);
                }
        }

        async function rejectRequest(requestId: string) {
                if (!token || !requestId) return;
                try {
                        await rejectChronosFriendRequest(requestId, token);
                        await refreshRequests();
                } catch (error) {
                        console.error('Failed to reject request', error);
                }
        }

        async function removeFriend(friendId: string) {
                if (!token || !friendId) return;
                try {
                        await removeChronosFriend(friendId, token);
                        await refreshFriends();
                        if (selectedFriendId === friendId) resetPanelState();
                } catch (error) {
                        console.error('Failed to remove friend', error);
                }
        }

        async function blockFriend(friendId: string) {
                if (!token || !friendId) return;
                try {
                        await blockChronosPlayer(friendId, token);
                        await refreshFriends();
                        if (selectedFriendId === friendId) resetPanelState();
                } catch (error) {
                        console.error('Failed to block friend', error);
                }
        }

        function resolveFriendLabel(friend: ChronosFriendSummary) {
                if (!friend) return 'Unknown';
                if (friend.username === username) return `${friend.username} (you)`;
                return friend.username;
        }

        async function inviteFriendToGame(friendId: string, mode: GameMode) {
                if (!token || !friendId) return;
                inviteStates.set(friendId, 'pending');
                inviteStates = new Map(inviteStates);
                try {
                        const response = await startChronosGameWithFriend(friendId, token, mode);
                        inviteStates.set(friendId, 'success');
                        inviteStates = new Map(inviteStates);
                        const resolvedMode = response.mode ?? mode;
                        const gameId = response.gameId;
                        if (browser && gameId) {
                                const path =
                                        resolvedMode === 'ATTRIBUTE_DUEL' || resolvedMode === 'DUEL'
                                                ? `/game/duel/${gameId}`
                                                : `/game/classic/${gameId}`;
                                goto(path);
                        }
                } catch (error) {
                        console.error('Failed to start friend game', error);
                        inviteStates.set(friendId, 'error');
                        inviteStates = new Map(inviteStates);
                }
        }

        async function loadChat(friendId: string, focus = true) {
                if (!token || !friendId) return;
                chatLoading = true;
                chatError = null;
                try {
                        chatMessages = await fetchChronosFriendChat(friendId, token);
                        selectedFriendId = friendId;
                        if (focus && browser) {
                                const chatBox = document.querySelector<HTMLDivElement>(
                                        '.friends-chat-body:last-child'
                                );
                                chatBox?.scrollTo({ top: chatBox.scrollHeight });
                        }
                } catch (error) {
                        console.error('Failed to load chat', error);
                        chatError = 'Unable to load chat history.';
                        chatMessages = [];
                } finally {
                        chatLoading = false;
                }
        }

        async function sendChatMessage() {
                if (!token || !selectedFriendId) return;
                const message = chatInputValue.trim();
                if (!message) return;
                chatError = null;
                try {
                        const savedMessage = await sendChronosFriendChatMessage(
                                selectedFriendId,
                                message,
                                token
                        );
                        if (savedMessage) {
                                chatMessages = [...chatMessages, savedMessage];
                        }
                        chatInputValue = '';
                } catch (error) {
                        console.error('Failed to send chat message', error);
                        chatError = 'Message failed to send.';
                }
        }

        function formatTimestamp(timestamp: string | null | undefined) {
                if (!timestamp) return '';
                const date = new Date(timestamp);
                if (Number.isNaN(date.getTime())) return '';
                return date.toLocaleString();
        }

        onDestroy(() => {
                if (refreshInterval) clearInterval(refreshInterval);
        });

        let wasOpen = false;
        $: if (open && !wasOpen) {
                wasOpen = true;
                resetPanelState();
                if (token) void initializePanel();
        }
        $: if (!open && wasOpen) {
                wasOpen = false;
                resetPanelState();
                if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                }
        }
</script>

{#if open}
        <div class="friends-backdrop" role="presentation" on:click={closePanel}>
                <div class="friends-panel" role="dialog" aria-modal="true" on:click|stopPropagation>
                        <header class="friends-header">
                                <div>
                                        <h2>Friends & Chat</h2>
                                        <p class="subtitle">Stay connected with other Chronos players.</p>
                                </div>
                                <button class="icon-btn" type="button" on:click={closePanel} aria-label="Close">
                                        ✕
                                </button>
                        </header>

                        <section class="friends-section">
                                <h3>Search players</h3>
                                <div class="search-row">
                                        <input
                                                class="search-input"
                                                type="search"
                                                placeholder="Search by username"
                                                bind:value={searchQuery}
                                        />
                                        <button
                                                class="action-btn"
                                                type="button"
                                                on:click={executeSearch}
                                                disabled={searchLoading || !searchQuery.trim()}
                                        >
                                                {searchLoading ? 'Searching…' : 'Search'}
                                        </button>
                                </div>
                                {#if searchError}
                                        <p class="error-text">{searchError}</p>
                                {/if}
                                {#if searchResults.length}
                                        <ul class="friends-list">
                                                {#each searchResults as candidate}
                                                        <li>
                                                                <span>{resolveFriendLabel(candidate)}</span>
                                                                <div class="row-actions">
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => sendFriendRequest(candidate.id)}
                                                                        >
                                                                                Add friend
                                                                        </button>
                                                                </div>
                                                        </li>
                                                {/each}
                                        </ul>
                                {:else if searchQuery.trim() && !searchLoading}
                                        <p class="muted">No players found.</p>
                                {/if}
                        </section>

                        <section class="friends-section">
                                <h3>Pending requests</h3>
                                {#if loadingRequests}
                                        <p class="muted">Loading requests…</p>
                                {:else if requests.length === 0}
                                        <p class="muted">No pending requests.</p>
                                {:else}
                                        <ul class="friends-list">
                                                {#each requests as request}
                                                        <li>
                                                                <span>{request.from.username}</span>
                                                                <div class="row-actions">
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => acceptRequest(request.id)}
                                                                        >
                                                                                Accept
                                                                        </button>
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => rejectRequest(request.id)}
                                                                        >
                                                                                Reject
                                                                        </button>
                                                                </div>
                                                        </li>
                                                {/each}
                                        </ul>
                                {/if}
                        </section>

                        <section class="friends-section">
                                <h3>Your friends</h3>
                                {#if loadingFriends}
                                        <p class="muted">Loading friends…</p>
                                {:else if friends.length === 0}
                                        <p class="muted">You have no friends yet. Search above to add some!</p>
                                {:else}
                                        <ul class="friends-list">
                                                {#each friends as friend}
                                                        <li class:selected={friend.id === selectedFriendId}>
                                                                <span>
                                                                        {resolveFriendLabel(friend)}
                                                                        {#if friend.status}
                                                                                <small class={`status ${friend.status.toLowerCase()}`}>
                                                                                        {friend.status}
                                                                                </small>
                                                                        {/if}
                                                                </span>
                                                                <div class="row-actions">
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => inviteFriendToGame(friend.id, 'CLASSIC')}
                                                                                disabled={inviteStates.get(friend.id) === 'pending'}
                                                                        >
                                                                                {inviteStates.get(friend.id) === 'pending'
                                                                                        ? 'Inviting…'
                                                                                        : 'Classic match'}
                                                                        </button>
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => inviteFriendToGame(friend.id, 'ATTRIBUTE_DUEL')}
                                                                                disabled={inviteStates.get(friend.id) === 'pending'}
                                                                        >
                                                                                {inviteStates.get(friend.id) === 'pending'
                                                                                        ? 'Inviting…'
                                                                                        : 'Attribute duel'}
                                                                        </button>
                                                                        <button
                                                                                class="link-btn"
                                                                                type="button"
                                                                                on:click={() => loadChat(friend.id)}
                                                                        >
                                                                                Chat
                                                                        </button>
                                                                        <button
                                                                                class="icon-btn small"
                                                                                type="button"
                                                                                on:click={() => removeFriend(friend.id)}
                                                                                title="Remove friend"
                                                                        >
                                                                                🗑️
                                                                        </button>
                                                                        <button
                                                                                class="icon-btn small"
                                                                                type="button"
                                                                                on:click={() => blockFriend(friend.id)}
                                                                                title="Block user"
                                                                        >
                                                                                ⛔
                                                                        </button>
                                                                </div>
                                                        </li>
                                                {/each}
                                        </ul>
                                {/if}
                        </section>

                        <section class="friends-section chat-section">
                                <h3>Direct messages</h3>
                                {#if !selectedFriendId}
                                        <p class="muted">Select a friend to open the chat.</p>
                                {:else}
                                        <div class="friends-chat">
                                                <div class="friends-chat-body">
                                                        {#if chatLoading}
                                                                <p class="muted">Loading messages…</p>
                                                        {:else if chatMessages.length === 0}
                                                                <p class="muted">No messages yet. Say hi!</p>
                                                        {:else}
                                                                {#each chatMessages as message}
                                                                        <div class={`chat-line ${message.senderUsername === username ? 'me' : ''}`}>
                                                                                <div class="meta">
                                                                                        <span class="author">
                                                                                                {message.senderUsername ?? message.senderId}
                                                                                        </span>
                                                                                        {#if message.createdAt}
                                                                                                <span class="timestamp">
                                                                                                        {formatTimestamp(message.createdAt)}
                                                                                                </span>
                                                                                        {/if}
                                                                                </div>
                                                                                <div class="body">{message.content}</div>
                                                                        </div>
                                                                {/each}
                                                        {/if}
                                                        {#if chatError}
                                                                <p class="error-text">{chatError}</p>
                                                        {/if}
                                                </div>
                                                <div class="friends-chat-input">
                                                        <textarea
                                                                bind:value={chatInputValue}
                                                                placeholder="Write a message"
                                                                rows="2"
                                                        />
                                                        <button class="action-btn" type="button" on:click={sendChatMessage}>
                                                                Send
                                                        </button>
                                                </div>
                                        </div>
                                {/if}
                        </section>
                </div>
        </div>
{/if}

<style>
        .friends-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.65);
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding: 60px 20px;
                z-index: 2000;
        }
        .friends-panel {
                background: rgba(14, 18, 28, 0.96);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                width: min(920px, 100%);
                max-height: calc(100vh - 120px);
                overflow-y: auto;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
                padding: 24px 28px 32px;
                color: #f1f5ff;
        }
        .friends-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                margin-bottom: 14px;
        }
        .friends-header h2 {
                margin: 0;
                font-size: 24px;
        }
        .subtitle {
                margin: 4px 0 0;
                color: #99a3c4;
                font-size: 14px;
        }
        .icon-btn {
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #f1f5ff;
                border-radius: 10px;
                padding: 6px 10px;
                cursor: pointer;
        }
        .icon-btn.small {
                padding: 4px 8px;
                font-size: 14px;
        }
        .icon-btn:hover {
                background: rgba(255, 255, 255, 0.14);
        }
        .friends-section {
                margin-top: 18px;
                padding-top: 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .friends-section:first-of-type {
                border-top: none;
                margin-top: 0;
                padding-top: 0;
        }
        .friends-section h3 {
                margin: 0 0 12px;
                font-size: 18px;
        }
        .search-row {
                display: flex;
                gap: 10px;
        }
        .search-input {
                flex: 1;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(6, 10, 18, 0.9);
                padding: 10px 12px;
                color: #f1f5ff;
        }
        .action-btn {
                border-radius: 10px;
                border: none;
                padding: 10px 16px;
                background: linear-gradient(135deg, #ffcc33, #ffb347);
                color: #1b1f2d;
                font-weight: 700;
                cursor: pointer;
        }
        .action-btn:disabled {
                opacity: 0.6;
                cursor: default;
        }
        .friends-list {
                list-style: none;
                margin: 12px 0 0;
                padding: 0;
                display: grid;
                gap: 8px;
        }
        .friends-list li {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                padding: 10px 12px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .friends-list li.selected {
                border-color: rgba(255, 204, 51, 0.6);
                box-shadow: 0 0 0 2px rgba(255, 204, 51, 0.15);
        }
        .friends-list span {
                display: flex;
                align-items: center;
                gap: 8px;
        }
        .row-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
        }
        .link-btn {
                background: none;
                border: none;
                color: #ffcc33;
                font-weight: 600;
                cursor: pointer;
        }
        .link-btn:hover {
                text-decoration: underline;
        }
        .muted {
                color: #98a0b5;
                font-size: 14px;
        }
        .error-text {
                color: #ff9fa1;
                font-size: 14px;
        }
        .friends-chat {
                display: grid;
                gap: 12px;
        }
        .friends-chat-body {
                max-height: 260px;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 12px;
                padding: 12px 14px;
                border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .chat-line {
                margin-bottom: 12px;
        }
        .chat-line:last-child {
                margin-bottom: 0;
        }
        .chat-line .meta {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                font-size: 12px;
                color: #a2abc4;
        }
        .chat-line.me .meta {
                color: #ffd65c;
        }
        .chat-line .body {
                margin-top: 4px;
                background: rgba(255, 255, 255, 0.08);
                padding: 8px 10px;
                border-radius: 8px;
                white-space: pre-wrap;
                word-break: break-word;
        }
        .chat-line.me .body {
                background: rgba(255, 204, 51, 0.18);
        }
        .friends-chat-input {
                display: flex;
                gap: 10px;
        }
        .friends-chat-input textarea {
                flex: 1;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(6, 10, 18, 0.9);
                color: #f1f5ff;
                padding: 10px 12px;
        }
        .status {
                text-transform: uppercase;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.08);
                letter-spacing: 0.4px;
        }
        .status.online {
                color: #8fffba;
        }
        .status.offline {
                color: #9aa3c4;
        }
        @media (max-width: 720px) {
                .friends-panel {
                        padding: 18px 18px 24px;
                }
                .row-actions {
                        flex-direction: column;
                        align-items: stretch;
                }
                .friends-list li {
                        align-items: flex-start;
                }
        }
</style>
