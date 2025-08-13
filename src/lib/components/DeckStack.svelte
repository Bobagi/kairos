<script lang="ts">
	/** Quantas cartas restam no deck */
	export let deckCount: number;

	/** Imagem do verso da carta */
	export let cardBackImageUrl: string;

	/** Proporção do card (mantém o verso bonito em qualquer tamanho) */
	export let aspectWidth = 430;
	export let aspectHeight = 670;

	/** Largura responsiva – idêntica à das cartas da mão (passada pelo page) */
	export let cardWidthCss = 'clamp(104px, 17.5vw, 200px)';

	/** Limite de cartas visíveis no stack (para não renderizar 100+) */
	export let maxVisible = 20;

	/** Deslocamento entre camadas (px) */
	export let offsetXPx = 2;
	export let offsetYPx = 1;

	/** Direção do empilhamento */
	export let direction: 'right' | 'left' = 'right';

	/** `contain` evita corte do verso; use `cover` se quiser preencher 100% com crop */
	export let imageFit: 'contain' | 'cover' = 'contain';

	// Derivados reativos
	$: visibleCount = Math.min(Math.max(0, deckCount), maxVisible);
	$: layers = Array.from({ length: visibleCount }, (_, i) => i);
	$: dir = direction === 'left' ? -1 : 1; // sinal para o translateX
</script>

<!-- Wrapper com a mesma largura do card da mão -->
<div
	class="deck-root"
	aria-label="Deck"
	style="position:relative;width:{cardWidthCss};aspect-ratio:{aspectWidth}/{aspectHeight};"
>
	{#each layers as i (i)}
		<div
			style="
        position:absolute; inset:0; border-radius:10px;
        overflow:visible; pointer-events:none;
        transform: translate({dir * i * offsetXPx}px, {i * offsetYPx}px);
        z-index:{i};
        filter: drop-shadow(0 2px 10px rgba(0,0,0,.35));
      "
		>
			<img
				src={cardBackImageUrl}
				alt="deck-card-back"
				style="
          position:absolute; inset:0; width:100%; height:100%;
          object-fit:{imageFit};
          display:block; border-radius:10px;
        "
				loading="eager"
				decoding="sync"
				draggable="false"
			/>
		</div>
	{/each}
</div>
