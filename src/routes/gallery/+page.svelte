<script lang="ts">
	import type { CardCatalogItem } from '$lib/api/GameClient';
	import { listAllCards } from '$lib/api/GameClient';
	import CardComposite from '$lib/components/CardComposite.svelte';
	import { onMount } from 'svelte';
	import '../game/game.css';
	// reaproveita frames/tilt/fontes

	let frameOverlayImageUrl: string | null = '/frames/default.png';
	const titleOverlayImageUrl = '/frames/title.png';

	let loading = true;
	let errorMsg: string | null = null;
	let cards: CardCatalogItem[] = [];
	let selected: CardCatalogItem | null = null;

	async function fetchTemplate() {
		try {
			const resp = await fetch('/game/templates');
			const templates = (await resp.json()) as Array<{ frameUrl?: string }>;
			const remote =
				Array.isArray(templates) && templates[0]?.frameUrl ? templates[0].frameUrl : null;
			if (remote) frameOverlayImageUrl = remote;
		} catch {
			/* se não existir o endpoint, mantém default */
		}
	}

	onMount(async () => {
		loading = true;
		errorMsg = null;
		try {
			await fetchTemplate();
			const data = await listAllCards();
			cards = data.map((c) => ({ ...c, imageUrl: (c as any).image ?? c.imageUrl }));
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			loading = false;
		}
	});

	function openModal(c: CardCatalogItem) {
		selected = c;
	}
	function closeModal() {
		selected = null;
	}
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && (selected = null)} />

<!-- Painel escuro central -->
<div class="fixed-top-bar">
	<a href="/" class="home-btn">← Home</a>
	<div class="mode-pill"><strong>Card Gallery</strong></div>
</div>
<div class="gallery-panel">
	<header class="panel-header">
		<div class="panel-title-wrap">
			<h1 class="panel-title">Card Gallery</h1>
			<p class="panel-sub">Clique em uma carta para ampliar.</p>
		</div>
	</header>

	{#if loading}
		<p class="status">Carregando cartas…</p>
	{:else if errorMsg}
		<p class="status error">Erro: {errorMsg}</p>
	{:else if !cards.length}
		<p class="status">Nenhuma carta encontrada.</p>
	{:else}
		<div class="gallery-grid">
			{#each cards as c (c.code + c.name)}
				<button type="button" class="card-tile" title={c.name} on:click={() => openModal(c)}>
					<div class="card-wrap">
						<CardComposite
							artImageUrl={c.imageUrl ?? ''}
							frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
							titleImageUrl={titleOverlayImageUrl}
							titleText={c.name ?? c.code}
							aspectWidth={430}
							aspectHeight={670}
							artObjectFit="cover"
							enableTilt={true}
							descriptionText={c.description ?? ''}
							magicValue={c.magic ?? 0}
							mightValue={c.might ?? 0}
							fireValue={c.fire ?? 0}
						/>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if selected}
	<div class="modal-backdrop" on:click|self={closeModal}>
		<div class="modal-card">
			<button class="modal-close" on:click={closeModal} aria-label="Fechar">×</button>
			<div class="modal-body">
				<div class="modal-inner">
					<div class="modal-card-wrap">
						<CardComposite
							artImageUrl={selected.imageUrl ?? ''}
							frameImageUrl={frameOverlayImageUrl ?? '/frames/default.png'}
							titleImageUrl={titleOverlayImageUrl}
							titleText={selected.name ?? selected.code}
							aspectWidth={430}
							aspectHeight={670}
							artObjectFit="cover"
							enableTilt={true}
							descriptionText={selected.description ?? ''}
							magicValue={selected.magic ?? 0}
							mightValue={selected.might ?? 0}
							fireValue={selected.fire ?? 0}
						/>
					</div>
					<div class="meta">
						<h2>{selected.name ?? selected.code}</h2>
						<p class="mono code">{selected.code}</p>
						<div class="attrs">
							<span>🧙 {selected.magic ?? 0}</span>
							<span>💪 {selected.might ?? 0}</span>
							<span>🔥 {selected.fire ?? 0}</span>
						</div>
						{#if selected.description}
							<p class="desc">{selected.description}</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ===== Painel escuro no estilo da home ===== */
	.gallery-panel {
		margin: clamp(18px, 5vh, 40px) auto;
		padding: clamp(16px, 2.2vw, 24px);
		border-radius: 16px;
		background: rgba(8, 10, 14, 0.88);
		color: #e7f2f3;
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow:
			0 26px 60px rgba(0, 0, 0, 0.45),
			0 10px 24px rgba(0, 0, 0, 0.35),
			inset 0 0 0 1px rgba(255, 255, 255, 0.04);
		backdrop-filter: blur(4px);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}
	.panel-title-wrap {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.panel-title {
		font-weight: 800;
		font-size: clamp(22px, 3.2vw, 36px);
		margin: 0;
	}
	.panel-sub {
		margin: 0;
		opacity: 0.8;
	}
	.panel-actions {
		display: flex;
		gap: 8px;
	}

	.status {
		opacity: 0.9;
		padding: 8px 0;
	}
	.status.error {
		color: #ffbdbd;
	}

	/* ===== Grade responsiva (5 → 1) ===== */
	.gallery-grid {
		display: grid;
		gap: clamp(12px, 1.6vw, 22px);
		grid-template-columns: repeat(5, minmax(220px, 1fr));
		align-items: start;
	}
	@media (max-width: 1280px) {
		.gallery-grid {
			grid-template-columns: repeat(4, minmax(200px, 1fr));
		}
	}
	@media (max-width: 1024px) {
		.gallery-grid {
			grid-template-columns: repeat(3, minmax(200px, 1fr));
		}
	}
	@media (max-width: 768px) {
		.gallery-grid {
			grid-template-columns: repeat(2, minmax(180px, 1fr));
		}
	}
	@media (max-width: 480px) {
		.gallery-grid {
			grid-template-columns: 1fr;
		}
	}

	.card-tile {
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 12px;
	}
	.card-tile:focus-visible {
		outline: 2px solid rgba(255, 255, 255, 0.35);
		outline-offset: 4px;
		border-radius: 12px;
	}
	.card-wrap {
		width: 100%;
		aspect-ratio: 430 / 670;
		margin: 0 auto;
	}
	.card-wrap :global(.CardComposite-root),
	.card-wrap :global(.CardComposite) {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* ===== Modal ===== */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: grid;
		place-items: center;
		z-index: 3000;
		padding: 16px;
	}
	.modal-card {
		position: relative;
		width: min(96vw, 1200px);
		max-height: 92vh;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 14px;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.5),
			inset 0 0 0 1px rgba(255, 255, 255, 0.06);
		backdrop-filter: blur(6px);
		display: flex;
		flex-direction: column;
	}
	.modal-close {
		position: absolute;
		top: 8px;
		right: 10px;
		font-size: 24px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: #fff;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		cursor: pointer;
		z-index: 1;
	}
	.modal-close:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.modal-body {
		overflow: auto;
		padding: clamp(10px, 1.2vw, 16px);
	}
	.modal-inner {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: start;
		min-width: 0;
	}
	.modal-card-wrap {
		height: min(78vh, calc((96vw - 140px) * 670 / 430));
		aspect-ratio: 430 / 670;
		width: auto;
		margin: 8px auto 2px;
	}
	.modal-card-wrap :global(.CardComposite-root),
	.modal-card-wrap :global(.CardComposite) {
		width: 100%;
		height: 100%;
		display: block;
	}

	.meta {
		color: #fff;
		min-width: 0;
	}
	.meta h2 {
		margin: 0 0 6px;
	}
	.meta .code {
		opacity: 0.85;
		margin: 0 0 12px;
	}
	.attrs {
		display: flex;
		gap: 10px;
		opacity: 0.95;
		margin-bottom: 8px;
		font-weight: 700;
	}
	.desc {
		opacity: 0.95;
		line-height: 1.4;
	}
	@media (max-width: 900px) {
		.modal-inner {
			grid-template-columns: 1fr;
		}
	}
</style>
