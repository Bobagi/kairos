<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { register as apiRegister, me } from '$lib/api/GameClient';
	import '../mainpage.css';

	let username = '';
	let password = '';
	let confirm = '';
	let err: string | null = null;

	async function handleRegister() {
		err = null;
		if (!username.trim()) {
			err = 'Username is required.';
			return;
		}
		if (!password) {
			err = 'Password is required.';
			return;
		}
		if (password !== confirm) {
			err = 'Passwords do not match.';
			return;
		}

		try {
			const r = await apiRegister(username.trim(), password);
			if (browser) localStorage.setItem('token', r.accessToken);
			// sanity check & vai pra home
			await me(r.accessToken).catch(() => {});
			goto('/');
		} catch (e) {
			console.error(e);
			err = 'Could not create account.';
		}
	}
</script>

<svelte:head>
	<title>Register – Chronos</title>
</svelte:head>

<div class="page-shell">
	<section class="content-panel">
		<header class="panel-header">
			<h1 class="panel-title">Create your account</h1>
			<p class="health-text">It’s quick and free.</p>
		</header>

		<form class="controls-col auth-col" on:submit|preventDefault={handleRegister}>
			<div class="auth-fields">
				<label class="input-wrap">
					<span class="input-label">Username</span>
					<input
						class="input-field"
						bind:value={username}
						placeholder="Nickname"
						autocomplete="username"
					/>
				</label>

				<label class="input-wrap">
					<span class="input-label">Password</span>
					<input
						class="input-field"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						autocomplete="new-password"
					/>
				</label>

				<label class="input-wrap">
					<span class="input-label">Confirm password</span>
					<input
						class="input-field"
						type="password"
						bind:value={confirm}
						placeholder="••••••••"
						autocomplete="new-password"
					/>
				</label>
			</div>

			<div class="auth-actions stacked">
				<button class="button button-accent" type="submit">Create account</button>
				<button class="button button-ghost" type="button" on:click={() => goto('/')}>← Back</button>
			</div>
		</form>

		{#if err}<p class="empty-text" style="color:#ffbdbd">{err}</p>{/if}
	</section>
</div>
