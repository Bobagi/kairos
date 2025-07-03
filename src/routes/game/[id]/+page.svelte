<script lang="ts">
	import { page } from '$app/stores';
	import GameStage from '$lib/components/GameStage.svelte';

	$: gameId = $page.params.id;
</script>

<h2 class="my-4 text-center text-xl">Game {gameId}</h2>
<GameStage />
