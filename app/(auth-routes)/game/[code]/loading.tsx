import GameShellSkeleton from "@/components/game/game-shell-skeleton";

/**
 * Shown while the game page resolves its data on the server.
 *
 * Without a loading boundary the App Router has nothing to swap to, so it holds
 * the previous page on screen until the whole payload lands — which is what made
 * "Create New Game" look like it had hung. The skeleton mirrors the real game
 * shell, and `Game` keeps showing it until its own data has resolved, so the
 * swap doesn't jump.
 */
export default function GameLoading() {
  return <GameShellSkeleton />;
}
