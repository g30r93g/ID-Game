import { v } from "convex/values";
import { authComponent } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { shouldSetCompletedAt } from "../lib/admin/metrics";
import { isConnected } from "../lib/presence";
import {
  deletePresence,
  lastAliveFor,
  loadPresence,
  recordHeartbeat,
} from "./presence";
import { evaluateContinuity, findReusableLobby } from "../lib/continuable";

function generateOTP(length = 6): string {
  const characters = "ACDEGHIKLMNPQRSTUVXYZ0123456789"; // some are missing to reduce ambiguity

  let otp = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    otp += characters[randomIndex];
  }
  return otp;
}

// Pick the least-hosted player from `candidates`, breaking ties at random.
// Host counts are tallied from all of the game's rounds so hosting stays even.
export async function pickHost(
  ctx: MutationCtx,
  gameId: Id<"games">,
  candidates: Doc<"players">[],
): Promise<Id<"players">> {
  if (candidates.length === 0) throw new Error("No players available.");

  const hostCounts = new Map<string, number>();
  const rounds = await ctx.db
    .query("gameRounds")
    .withIndex("byGame", (q) => q.eq("gameId", gameId))
    .collect();
  rounds.forEach((round) => {
    hostCounts.set(
      round.hostPlayerId,
      (hostCounts.get(round.hostPlayerId) || 0) + 1,
    );
  });

  const minHostingCount = Math.min(
    ...candidates.map((p) => hostCounts.get(p._id) || 0),
  );
  const leastHosted = candidates.filter(
    (p) => (hostCounts.get(p._id) || 0) === minHostingCount,
  );

  return leastHosted[Math.floor(Math.random() * leastHosted.length)]._id;
}

export const sendHeartbeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to send a heartbeat.");
    }

    // Get the player associated with the user *in this game* (a user may be in
    // several games at once, so byUser().first() is not safe here).
    const player = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", args.gameId).eq("userId", userId),
      )
      .first();

    if (!player) {
      throw new Error("No player found for authed user");
    }

    // A live heartbeat means the player is present. The beat itself goes to
    // `playerPresence`: nearly every game query reads `players`, so writing
    // the player's row every 15s would re-run all of them for every client.
    await recordHeartbeat(ctx, player, Date.now());

    // Undo any consensus removal: they have reconnected. The only write to
    // `players` a heartbeat makes, and only when there is something to undo.
    if (player.active === false) {
      await ctx.db.patch(player._id, { active: true });
    }

    // Somebody is back, so the game is not abandoned after all. Patched only
    // when the mark is actually set — heartbeats land every 15s and must not
    // write to the game document for no reason.
    const game = await ctx.db.get(args.gameId);
    if (game?.abandonedAt !== undefined) {
      await ctx.db.patch(args.gameId, { abandonedAt: undefined });
    }

    // A reconnecting player cancels any in-flight vote against them.
    const votesAgainstPlayer = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", args.gameId).eq("targetPlayerId", player._id),
      )
      .collect();
    await Promise.all(
      votesAgainstPlayer.map((voteRow) => ctx.db.delete(voteRow._id)),
    );
  },
});

/**
 * @deprecated Superseded by {@link fetchGameAndMembership}, which answers this
 * and returns the game in the same round trip. Nothing calls this any more.
 *
 * Kept for one deploy cycle only: a browser tab loaded before the deploy still
 * holds a live subscription to the old pair, and Convex resolves subscriptions
 * by name. Delete both once no pre-deploy tabs can still be open.
 */
export const isUserPlayer = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to join a game.");
    }

    // Ensure game exists
    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (!game) {
      throw new Error("Game does not exist.");
    }

    // Only add user if not already in game
    const userPlayer = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", user.subject),
      )
      .first();

    return !!userPlayer;
  },
});

/**
 * @deprecated Superseded by {@link fetchGameAndMembership}. See the note on
 * {@link isUserPlayer} for why this is still exported.
 */
export const fetchGameByJoinCode = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .unique();

    if (!game) {
      console.error(`No game found with join code: ${args.joinCode}`);
      return null;
    }

    return game;
  },
});

/**
 * The game page's single read: the game behind a join code, plus whether the
 * caller is already one of its players.
 *
 * Both facts used to come from separate calls — `fetchGameByJoinCode` and
 * `isUserPlayer` — which cost the page two sequential network round trips and
 * looked the same game up twice. The page blocks on this before it can render,
 * so the second trip was dead time on every navigation into a game.
 *
 * An unknown join code is returned as `game: null` rather than thrown, so the
 * page can redirect; `isUserPlayer` threw, which surfaced a server error screen.
 */
export const fetchGameAndMembership = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to load a game.");
    }

    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .unique();

    if (!game) {
      return { game: null, isPlayer: false };
    }

    const userPlayer = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", user.subject),
      )
      .first();

    return { game, isPlayer: !!userPlayer };
  },
});

/**
 * What an invite link says about its game, for the public /join page and its
 * link-preview image.
 *
 * Deliberately unauthenticated: link-preview crawlers carry no session. It
 * returns only what anyone holding the join code could already learn by
 * joining — the creator's display name and the round count — never user ids.
 *
 * `status` collapses the game's lifecycle into what an invitee cares about:
 * `open` can be joined, `started` is closed to new players, and `ended` is
 * finished or abandoned. An unknown code is `null`.
 */
export const getInvite = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .unique();
    if (!game) return null;

    // The creator's own players row, not their account: that is the name the
    // lobby shows. They may have left, or never set a name, in which case the
    // invite goes nameless rather than inviting you to "Unknown Player's game".
    const host = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", game.createdBy),
      )
      .first();

    const status: "open" | "started" | "ended" =
      game.completedAt !== undefined || game.abandonedAt !== undefined
        ? "ended"
        : game.isOpen
          ? "open"
          : "started";

    return {
      joinCode: game.joinCode,
      hostName:
        host && host.displayName !== "Unknown Player" ? host.displayName : null,
      totalRounds: game.totalRounds,
      status,
    };
  },
});

export const createGame = mutation({
  args: { numberOfRounds: v.number() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to create a game.");
    }
    // Guests can join games but not host them: accounts are what keep bots
    // from creating and abandoning games. The claim comes from the signed
    // Convex JWT, which carries the Better Auth user row's `isAnonymous`.
    if (user.isAnonymous === true) {
      throw new Error("Guests can't create games. Create an account to host.");
    }

    const authUser = await authComponent.safeGetAuthUser(ctx);
    const displayName = authUser?.name?.trim() || "Unknown Player";

    // Reuse the user's existing open lobby instead of creating a duplicate.
    // Guards against rapid repeated submits (and any mutation retry) creating
    // a burst of party-of-one games. Race-safe under Convex's OCC: a concurrent
    // insert conflicts on this read set and re-runs, finding the game below.
    const existingOpenGame = findReusableLobby(
      await ctx.db
        .query("games")
        .withIndex("byIsOpenCreatedBy", (q) =>
          q.eq("isOpen", true).eq("createdBy", user.subject),
        )
        .collect(),
    );
    if (existingOpenGame) {
      return existingOpenGame;
    }

    // create game
    const gameId = await ctx.db.insert("games", {
      joinCode: generateOTP(),
      totalRounds: args.numberOfRounds,
      isOpen: true,
      createdBy: user.subject,
    });

    // add player who created game to game
    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      userId: user.subject,
      gameId: gameId,
      lastAlive: now,
      displayName,
    });
    await recordHeartbeat(ctx, { _id: playerId, gameId }, now);

    // return game
    return await ctx.db.get(gameId);
  },
});

export const joinGame = mutation({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to join a game.");
    }

    // Ensure game exists
    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (!game) {
      throw new Error("Game does not exist.");
    }

    // Ensure game is open to new players
    if (!game.isOpen) {
      throw new Error("Game is not open to new players.");
    }

    // Only add user if not already in game
    const userPlayer = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", user.subject),
      )
      .first();

    if (!userPlayer) {
      const authUser = await authComponent.safeGetAuthUser(ctx);
      const displayName = authUser?.name?.trim() || "Unknown Player";

      // Link player to game
      const now = Date.now();
      const playerId = await ctx.db.insert("players", {
        userId: user.subject,
        gameId: game._id,
        lastAlive: now,
        displayName,
      });
      await recordHeartbeat(ctx, { _id: playerId, gameId: game._id }, now);
    }
  },
});

/**
 * Copies the caller's account display name onto every players row they own.
 *
 * A players row snapshots the display name at create/join time, so anyone who
 * ended up without a name on their account — signing in with a fresh email via
 * the OTP tab creates the account with an empty `name` — is stamped
 * "Unknown Player" in every game they have already touched. Following an invite
 * link joins them server-side before any UI can ask for a name, so a rename has
 * to reach backwards; the naming prompt calls this straight after saving.
 *
 * Returns the number of rows brought up to date.
 */
export const syncDisplayName = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to sync their display name.");
    }

    // Read the name from the account rather than taking it as an argument, so
    // a player's card can never drift from the name on their account.
    const authUser = await authComponent.safeGetAuthUser(ctx);
    const displayName = authUser?.name?.trim();
    // Nothing to propagate. Leave the rows alone rather than overwriting names
    // that are already there with the placeholder.
    if (!displayName) return 0;

    const players = await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", user.subject))
      .collect();
    const stale = players.filter((player) => player.displayName !== displayName);

    await Promise.all(
      stale.map((player) => ctx.db.patch(player._id, { displayName })),
    );

    return stale.length;
  },
});

export const leaveGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User must be authenticated to leave a game.");
    }

    // Get the player for the game
    const userPlayer = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", args.gameId).eq("userId", user.subject),
      )
      .first();
    if (!userPlayer) {
      return;
    }

    // Delete them from the list of players
    await deletePresence(ctx, userPlayer._id);
    await ctx.db.delete(userPlayer._id);
  },
});

// Stop new players joining. Shared by startGame and the deprecated
// closeGameToNewPlayers; callers do their own authorisation.
async function closeLobby(ctx: MutationCtx, game: Doc<"games">) {
  await ctx.db.patch(game._id, { isOpen: false });
}

/**
 * @deprecated Superseded by {@link startGame}, which closes the lobby and
 * starts round 1 in one transaction. The client no longer calls this.
 *
 * Kept for one deploy cycle only, for the same reason as {@link isUserPlayer}:
 * tabs loaded before the deploy still call it by name.
 */
export const closeGameToNewPlayers = mutation({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to close a game.");
    }

    // Only the creator runs the lobby, so only they may close it. Game ids
    // reach every client, so without this anyone could shut someone else's.
    const game = await ctx.db.get(args.game);
    if (!game) throw new Error("Game not found.");
    if (game.createdBy !== userId) {
      throw new Error("Only the game's creator can close it to new players.");
    }

    await closeLobby(ctx, game);
  },
});

export const getPlayersForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .collect();
  },
});

/**
 * Each player's newest heartbeat, one row per player. Apart from the join
 * screen's `getMyActiveGames`, the only query a heartbeat invalidates, so only
 * the components that show liveness subscribe to it; everything else reads
 * `players`, which a beat no longer writes.
 */
export const getPresenceForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const [players, presence] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", args.gameId))
        .collect(),
      loadPresence(ctx, args.gameId),
    ]);
    return players.map((player) => ({
      playerId: player._id,
      lastAlive: lastAliveFor(player, presence),
    }));
  },
});

/**
 * Seats `getMyActiveGames` looks at, newest first. A game only stays
 * continuable for a couple of hours after its last heartbeat
 * (lib/continuable.ts), so in practice a live game is among a user's most
 * recent seats; reading every seat they have ever had grows without bound.
 */
export const MAX_ACTIVE_SEATS = 25;

export const getMyActiveGames = query({
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated.");
    }

    const now = Date.now();

    // Newest seat first, which is also the order returned. It only changes
    // when the user joins a game, so a co-player's heartbeat never reorders
    // the list and re-pushes it to the join screen.
    const myPlayerRows = await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ACTIVE_SEATS);

    const results = await Promise.all(
      myPlayerRows.map(async (myPlayer) => {
        // Skip games this user was removed from.
        if (myPlayer.active === false) return null;

        const game = await ctx.db.get(myPlayer.gameId);
        // Skip missing, finished, or already-marked games. The rules are still
        // evaluated below: the mark is only an hourly snapshot of them, so a
        // game can break the rules before the cron has seen it.
        if (!game || game.completedAt !== undefined) return null;
        if (game.abandonedAt !== undefined) return null;

        const [players, presence] = await Promise.all([
          ctx.db
            .query("players")
            .withIndex("byGame", (q) => q.eq("gameId", game._id))
            .collect(),
          loadPresence(ctx, game._id),
        ]);
        const activePlayers = players.filter((p) => p.active !== false);
        // Others, not everyone: the caller is sitting on the join screen, where
        // no heartbeat is sent, so counting themselves would be misleading.
        const othersOnline = activePlayers.filter(
          (p) =>
            p._id !== myPlayer._id &&
            isConnected(lastAliveFor(p, presence), now),
        ).length;
        const lastActivityAt = activePlayers.reduce(
          (newest, p) => Math.max(newest, lastAliveFor(p, presence)),
          0,
        );

        // Hide games that have been abandoned rather than merely left.
        const continuity = evaluateContinuity(
          {
            startedAt: game.startedAt,
            lastActivityAt,
            activePlayerCount: activePlayers.length,
          },
          now,
        );
        if (!continuity.continuable) return null;

        // No activity time in the result: it moves on every heartbeat, so
        // returning it would re-push this query to the client on each beat.
        return {
          gameId: game._id,
          joinCode: game.joinCode,
          isOpen: game.isOpen,
          currentRound: game.currentRound ?? 0,
          totalRounds: game.totalRounds,
          othersOnline,
        };
      }),
    );

    return results.filter((result) => result !== null);
  },
});

export const getPlayerForCurrentUserForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // Get current user
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated.");
    }

    // Match user to player in game
    return await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", args.game).eq("userId", userId),
      )
      .first();
  },
});

export const getGameRoundsForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameRounds")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .collect();
  },
});

export const getCurrentGameRound = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // get game
    const game = await ctx.db.get(args.game);
    if (!game) return null;

    // extract game's current round number
    const currentRoundNumber = game.currentRound;
    if (!currentRoundNumber) return null;

    // return current round of game
    return await ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", args.game).eq("roundNumber", currentRoundNumber),
      )
      .unique();
  },
});

/**
 * @deprecated The game screen now finds the host in the player list it already
 * subscribes to. This subscription re-pushed the host's document to every
 * client on each of their heartbeats, only for its display name.
 *
 * Kept for one deploy cycle only, for the same reason as {@link isUserPlayer}:
 * tabs loaded before the deploy still subscribe to it by name.
 */
export const getCurrentGameRoundHostPlayer = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // get game
    const game = await ctx.db.get(args.game);
    if (!game) return null;

    // extract game's current round number
    const currentRoundNumber = game.currentRound;
    if (!currentRoundNumber) return null;

    // get game round
    const currentRound = await ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", args.game).eq("roundNumber", currentRoundNumber),
      )
      .unique();
    if (!currentRound) return null;

    // get host for round
    return await ctx.db.get(currentRound.hostPlayerId);
  },
});

// The caller's player row, which must be active. Every mutation that moves a
// game between rounds requires one: game ids reach every client, so without
// it anyone could skip rounds or pick the next host.
async function requireActivePlayer(
  ctx: MutationCtx,
  gameId: Id<"games">,
  userId: string,
): Promise<Doc<"players">> {
  const caller = await ctx.db
    .query("players")
    .withIndex("byGameUser", (q) => q.eq("gameId", gameId).eq("userId", userId))
    .first();
  if (!caller || caller.active === false) {
    throw new Error("Only active players in the game can start a round.");
  }
  return caller;
}

// Create the game's next round and point the game at it. Returns null once no
// rounds are left. Shared by startGame, finishRoundAndStartNext and the
// deprecated startNewGameRound; callers do their own authorisation.
async function startNextRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  hostPlayer?: Id<"players">,
): Promise<Id<"gameRounds"> | null> {
  // define the variable to hold the player
  let player: Id<"players"> | undefined;

  // determine the new round number
  const newRoundNumber = (game.currentRound ?? 0) + 1;

  // No rounds left — the game is over (round counts are always >= 1, enforced in createGame).
  if (newRoundNumber > game.totalRounds) {
    return null;
  }

  // If player is manually provided, use it directly
  if (hostPlayer) {
    const existingPlayer = await ctx.db.get(hostPlayer);
    if (!existingPlayer || existingPlayer.gameId !== game._id) {
      throw new Error("Invalid player specified.");
    }

    player = existingPlayer._id;
  }

  // Step 0: If game has no rounds (newRoundNumber === 1), assign player that created game
  if (newRoundNumber === 1) {
    const creatorPlayer = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", game.createdBy),
      )
      .first();

    if (creatorPlayer) {
      player = creatorPlayer._id;
    } else {
      throw new Error("No players within game to select as host");
    }
  }

  // if the player is still undefined, we pick the least-hosted player
  if (!player) {
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .collect();
    const activePlayers = players.filter((p) => p.active !== false);
    player = await pickHost(ctx, game._id, activePlayers);
  }

  // ensure player is defined
  if (!player) {
    // this should never run
    throw new Error("Next host player indeterminate");
  }

  const newGameRound = await ctx.db.insert("gameRounds", {
    gameId: game._id,
    roundNumber: newRoundNumber,
    hostPlayerId: player,
    phase: "create-scenarios",
  });

  // update the round number; stamp the game's start time on round 1
  await ctx.db.patch(game._id, {
    currentRound: newRoundNumber,
    ...(newRoundNumber === 1 ? { startedAt: Date.now() } : {}),
  });

  return newGameRound;
}

/**
 * @deprecated Superseded by {@link startGame} and
 * {@link finishRoundAndStartNext}, which each move the game across a round
 * boundary in one transaction. The client no longer calls this.
 *
 * Kept for one deploy cycle only, for the same reason as {@link isUserPlayer}:
 * tabs loaded before the deploy still call it by name.
 */
export const startNewGameRound = mutation({
  args: { game: v.id("games"), player: v.optional(v.id("players")) },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to start a round.");
    }

    // Fetch current game to get the latest round number
    const game = await ctx.db.get(args.game);
    if (!game) throw new Error("Game not found.");

    await requireActivePlayer(ctx, game._id, userId);

    // determine the new round number
    const newRoundNumber = (game.currentRound ?? 0) + 1;

    // No rounds left — the game is over (round counts are always >= 1, enforced in createGame).
    if (newRoundNumber > game.totalRounds) {
      return null;
    }

    // Round 1 is the creator's to start, the same as closing the lobby. After
    // that the current round must have finished: only its host can move it to
    // "finished" (see transitionRoundPhase), and any player may then start the
    // next one, so a host who drops between the two calls doesn't strand the
    // game.
    if (newRoundNumber === 1) {
      if (game.createdBy !== userId) {
        throw new Error("Only the game's creator can start the first round.");
      }
    } else {
      const currentRound = await ctx.db
        .query("gameRounds")
        .withIndex("byGameRound", (q) =>
          q.eq("gameId", args.game).eq("roundNumber", newRoundNumber - 1),
        )
        .unique();
      if (currentRound?.phase !== "finished") {
        throw new Error(
          "The current round must finish before the next one starts.",
        );
      }
    }

    return await startNextRound(ctx, game, args.player);
  },
});

export const scenarioCategories = query({
  handler: async (ctx) => {
    const scenarios = await ctx.db.query("scenarios").collect();

    // Extract unique categories
    return [...new Set(scenarios.map((s) => s.category))];
  },
});

// Whether this caller may know which scenario the round host picked. The host
// chose it, so they always may; everyone else waits for the reveal. Convex ships
// query results to every subscriber, so without this gate `selected: true` is
// readable straight out of a guesser's client cache during guess-scenario.
async function canSeeSelectedScenario(
  ctx: QueryCtx,
  round: Doc<"gameRounds">,
): Promise<boolean> {
  if (round.phase === "display-results" || round.phase === "finished") {
    return true;
  }

  const userId = (await ctx.auth.getUserIdentity())?.subject;
  if (!userId) return false;

  const host = await ctx.db.get(round.hostPlayerId);
  return host?.userId === userId;
}

export const gameRoundScenarios = query({
  args: { gameRound: v.id("gameRounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.gameRound);
    if (!round) return [];

    const revealSelected = await canSeeSelectedScenario(ctx, round);

    // Fetch all gameRoundScenarios entries for the given game round
    const scenarios = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.gameRound))
      .collect();

    // Get all scenarioIds
    const scenarioIds = scenarios.map((s) => s.scenarioId);

    // Fetch each scenario individually
    const scenarioDocs = await Promise.all(
      scenarioIds.map((id) => ctx.db.get(id)),
    );

    // Map scenario documents by ID for quick lookup
    const scenarioMap = new Map(
      scenarioDocs.filter(Boolean).map((s) => [s!._id, s]),
    );

    // Attach scenario details to each gameRoundScenario entry. `selected` is
    // blanked rather than omitted so the shape stays stable for every caller.
    return scenarios.map((scenario) => ({
      ...scenario,
      selected: revealSelected ? scenario.selected : false,
      scenarioDetails: scenarioMap.get(scenario.scenarioId) ?? null, // Ensure graceful fallback
    }));
  },
});

export const selectScenariosForGameRound = mutation({
  args: {
    game: v.id("games"),
    gameRound: v.id("gameRounds"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to draw round scenarios.");
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.gameRound);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host. This matters more now than it did
    // when the mutation only inserted: it deletes any previous draw, so without
    // the check any player could wipe the host's scenarios mid-round.
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error(
        "Only the game round host can draw the round's scenarios",
      );
    }

    // Fetch scenarios, leveraging index if a category is specified
    const query = args.category
      ? ctx.db
          .query("scenarios")
          .withIndex("byCategory", (q) => q.eq("category", args.category!))
      : ctx.db.query("scenarios");

    const scenarios = await query.collect();

    // Checked before anything is deleted, so a re-draw into a category that
    // turns out to be too small leaves the existing draw intact.
    if (scenarios.length < 10) {
      throw new Error(
        "Not enough scenarios available in the selected category.",
      );
    }

    // A re-draw replaces the previous category's scenarios rather than adding to
    // them. Once the host has locked one in the category can no longer change:
    // selectGameRoundScenario has already incremented scenarios.timesSelected,
    // and unwinding that is out of scope.
    const existingDraw = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.gameRound))
      .collect();
    if (existingDraw.some((row) => row.selected)) {
      throw new Error("A scenario has already been selected.");
    }
    await Promise.all(existingDraw.map((row) => ctx.db.delete(row._id)));

    // Shuffle and pick 10 scenarios
    const shuffledScenarios = scenarios.sort(() => Math.random() - 0.5);
    const selectedScenarios = shuffledScenarios.slice(0, 10);

    // Insert gameRoundScenarios entries for the selected scenarios
    await Promise.all(
      selectedScenarios.map((scenario) =>
        ctx.db.insert("gameRoundScenarios", {
          gameId: args.game,
          roundId: args.gameRound,
          scenarioId: scenario._id,
          selected: false,
        }),
      ),
    );

    return true;
  },
});

type RoundPhase = Doc<"gameRounds">["phase"];

// Move a round to `toPhase`, enforcing the legal transitions, and stamp the
// game complete when its final round reaches its end. Returns whether the
// phase actually changed. Shared by transitionRoundPhase and
// finishRoundAndStartNext; callers do their own authorisation.
async function advanceRoundPhase(
  ctx: MutationCtx,
  gameRound: Doc<"gameRounds">,
  toPhase: RoundPhase,
): Promise<boolean> {
  // Enforce a legal forward phase transition. Phases advance linearly; a skip,
  // rewind, or unknown jump is rejected. A no-op to the same phase is allowed
  // so a double-submit / mutation retry doesn't error.
  const NEXT_PHASE: Partial<Record<RoundPhase, RoundPhase>> = {
    "create-scenarios": "pick-scenario",
    "pick-scenario": "rank-players",
    "rank-players": "guess-scenario",
    "guess-scenario": "display-results",
    "display-results": "finished",
  };
  // The single sanctioned rewind: the host backing out of a category choice to
  // pick a different one. Legal only while nothing has been locked in — after
  // that `selectGameRoundScenario` has already bumped the scenario's
  // timesSelected, and unwinding it is out of scope. Checked lazily so the
  // extra read only happens for this one phase pair.
  let isCategoryRewind = false;
  if (gameRound.phase === "pick-scenario" && toPhase === "create-scenarios") {
    const lockedIn = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRoundSelected", (q) =>
        q.eq("roundId", gameRound._id).eq("selected", true),
      )
      .first();
    isCategoryRewind = lockedIn === null;
  }

  if (
    toPhase !== gameRound.phase &&
    NEXT_PHASE[gameRound.phase] !== toPhase &&
    !isCategoryRewind
  ) {
    throw new Error(
      `Illegal phase transition: ${gameRound.phase} -> ${toPhase}`,
    );
  }

  // change phase. A no-op leaves the document alone, so a retry doesn't
  // invalidate every subscriber to the round.
  const changed = toPhase !== gameRound.phase;
  if (changed) {
    await ctx.db.patch(gameRound._id, { phase: toPhase });
  }

  // Mark the guesses in the same transaction as the reveal, so every player's
  // first frame of results is already right. Doing it from the host's browser
  // afterwards showed everyone all-wrong until it landed, or for good if the
  // host had gone. Guesses can't arrive after this: makeGuessForRound only
  // takes them during guess-scenario.
  if (changed && toPhase === "display-results") {
    await markGuesses(ctx, gameRound._id);
  }

  // stamp game completion when the final round finishes
  const game = await ctx.db.get(gameRound.gameId);
  if (
    game &&
    game.completedAt === undefined &&
    shouldSetCompletedAt(toPhase, gameRound.roundNumber, game.totalRounds)
  ) {
    await ctx.db.patch(game._id, { completedAt: Date.now() });
  }

  return changed;
}

export const transitionRoundPhase = mutation({
  args: {
    gameRoundId: v.id("gameRounds"),
    toPhase: v.union(
      v.literal("create-scenarios"),
      v.literal("pick-scenario"),
      v.literal("rank-players"),
      v.literal("guess-scenario"),
      v.literal("display-results"),
      v.literal("finished"),
    ),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to create a game.");
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.gameRoundId);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error("Only game round host can transition a game round");
    }

    await advanceRoundPhase(ctx, gameRound, args.toPhase);
  },
});

/**
 * Close the lobby and start round 1, with the creator as its host, in one
 * transaction. Chaining closeGameToNewPlayers and startNewGameRound cost two
 * round trips, and every client rendered the closed-but-roundless game in
 * between.
 *
 * Only the creator may call it. Calling it again once the game has started is
 * a no-op that returns the current round, so a double-click or a retry never
 * starts a second round.
 */
export const startGame = mutation({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to start a game.");
    }

    // Only the creator runs the lobby, so only they may start the game.
    const game = await ctx.db.get(args.game);
    if (!game) throw new Error("Game not found.");
    if (game.createdBy !== userId) {
      throw new Error("Only the game's creator can start it.");
    }

    if (game.isOpen) {
      await closeLobby(ctx, game);
    }

    const currentRoundNumber = game.currentRound;
    if (currentRoundNumber) {
      const currentRound = await ctx.db
        .query("gameRounds")
        .withIndex("byGameRound", (q) =>
          q.eq("gameId", game._id).eq("roundNumber", currentRoundNumber),
        )
        .unique();
      return currentRound?._id ?? null;
    }

    return await startNextRound(ctx, game);
  },
});

/**
 * Finish a round and start the next one in one transaction. Chaining
 * transitionRoundPhase and startNewGameRound cost two round trips, and every
 * client rendered the "finished" phase in between. Returns the new round's id,
 * or null on the final round, which is still moved to "finished" (and the game
 * stamped complete). Normal play leaves the final round through "Finish Game"
 * and the rating screen instead, so the client never calls this for it.
 *
 * The same rules as the two calls it replaces: only the round's host may
 * finish it, and once it has finished any active player may start the next,
 * so a host who dropped between the two old calls doesn't strand the game.
 * Calling it again after the next round exists is a no-op that returns that
 * round, so a double-click or a retry never starts a second one.
 */
export const finishRoundAndStartNext = mutation({
  args: { round: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to finish a round.");
    }

    // Get game round referenced
    const round = await ctx.db.get(args.round);
    if (!round) {
      throw new Error("Game round does not exist");
    }

    const game = await ctx.db.get(round.gameId);
    if (!game) throw new Error("Game not found.");

    await requireActivePlayer(ctx, game._id, userId);

    // Already moved on: hand back the round that followed.
    const nextRound = await ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", game._id).eq("roundNumber", round.roundNumber + 1),
      )
      .unique();
    if (nextRound) {
      return nextRound._id;
    }

    if (game.currentRound !== round.roundNumber) {
      throw new Error("Only the game's current round can be finished.");
    }

    if (round.phase !== "finished") {
      // The host is read here rather than trusted from the client:
      // castPresenceVote can reassign it mid-round.
      const host = await ctx.db.get(round.hostPlayerId);
      if (host?.userId !== userId) {
        throw new Error("Only game round host can finish a game round");
      }

      await advanceRoundPhase(ctx, round, "finished");
    }

    return await startNextRound(ctx, game);
  },
});

export const selectGameRoundScenario = mutation({
  args: {
    gameRoundId: v.id("gameRounds"),
    gameRoundScenarioId: v.id("gameRoundScenarios"),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error(
        "User must be authenticated to select a game round scenario.",
      );
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.gameRoundId);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error(
        "Only the game round host can select the round's scenario",
      );
    }

    // Ensure game round scenario exists
    const selectedGameRoundScenario = await ctx.db.get(
      args.gameRoundScenarioId,
    );
    if (
      !selectedGameRoundScenario ||
      selectedGameRoundScenario.roundId !== args.gameRoundId
    ) {
      throw new Error("Invalid game round scenario");
    }

    // Unselect any previously selected scenario for this game round
    const selectedScenariosForRound = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRoundSelected", (q) =>
        q.eq("roundId", args.gameRoundId).eq("selected", true),
      )
      .collect();

    if (selectedScenariosForRound.length > 0) {
      throw new Error("A scenario has already been selected.");
    }

    // Change selected state for the chosen scenario
    await ctx.db.patch(args.gameRoundScenarioId, { selected: true });

    // Increment the popularity counter on the underlying scenario
    const scenario = await ctx.db.get(selectedGameRoundScenario.scenarioId);
    if (scenario) {
      await ctx.db.patch(scenario._id, {
        timesSelected: (scenario.timesSelected ?? 0) + 1,
      });
    }
  },
});

export const submitPlayerRankingsForGameRound = mutation({
  args: {
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    rankings: v.array(
      v.object({ ranking: v.number(), playerId: v.id("players") }),
    ),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error(
        "User must be authenticated to select a game round scenario.",
      );
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.roundId);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error("Only the game round host can rank players");
    }

    // Submit ranking for each player
    await Promise.all(
      args.rankings.map((r) => {
        return ctx.db.insert("gameRoundPlayerRankings", {
          ...r,
          gameId: args.gameId,
          roundId: args.roundId,
        });
      }),
    );
  },
});

export const getPlayerRankingsForRound = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Get rankings for the specified round
    const rankings = await ctx.db
      .query("gameRoundPlayerRankings")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Get player IDs from rankings
    const players = (
      await Promise.all(rankings.map((ranking) => ctx.db.get(ranking.playerId)))
    ).filter((x) => x !== null);

    // Combine rankings with player display names
    return rankings.map((ranking) => ({
      ...ranking,
      playerDisplayName:
        players.find((p) => p._id === ranking.playerId)?.displayName ??
        "Unknown Player",
    }));
  },
});

// Record on each of the round's guesses whether it picked the host's scenario.
// Returns false, marking nothing, when the round has no selected scenario.
// Idempotent. Callers do their own authorisation.
async function markGuesses(
  ctx: MutationCtx,
  roundId: Id<"gameRounds">,
): Promise<boolean> {
  // Fetch all guesses for this round
  const guesses = await ctx.db
    .query("gameRoundGuesses")
    .withIndex("byRound", (q) => q.eq("roundId", roundId))
    .collect();

  // Get the selected scenario for the game round (assuming one selected scenario per round)
  const selectedScenario = await ctx.db
    .query("gameRoundScenarios")
    .withIndex("byRoundSelected", (q) =>
      q.eq("roundId", roundId).eq("selected", true),
    )
    .first();

  if (!selectedScenario) {
    return false;
  }

  // Determine correct guesses by comparing the guessed scenario ID with the selected scenario ID
  await Promise.all(
    guesses.map((guess) =>
      ctx.db.patch(guess._id, {
        isCorrect: guess.scenarioId === selectedScenario._id,
      }),
    ),
  );
  return true;
}

/**
 * @deprecated Guesses are now marked by the transition to "display-results"
 * itself (see advanceRoundPhase). The client no longer calls this.
 *
 * Kept for one deploy cycle only, for the same reason as {@link isUserPlayer}:
 * tabs loaded before the deploy still call it by name.
 */
export const markGuessesForRound = mutation({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error(
        "User must be authenticated to select a game round scenario.",
      );
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.roundId);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error("Only the game round host can determine who was correct");
    }

    if (!(await markGuesses(ctx, args.roundId))) {
      throw new Error("No selected scenario found for this round");
    }
  },
});

export const getGuessesForRound = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    const guesses = await ctx.db
      .query("gameRoundGuesses")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Get player details
    const players = (
      await Promise.all(guesses.map((g) => ctx.db.get(g.playerId)))
    ).filter((x) => x !== null);

    // Get gameRoundScenario documents
    const gameRoundScenarios = (
      await Promise.all(
        guesses.map((g) => (g.scenarioId ? ctx.db.get(g.scenarioId) : null)),
      )
    ).filter((x) => x !== null);

    // Get actual scenario documents
    const scenarios = (
      await Promise.all(
        gameRoundScenarios.map((grs) => ctx.db.get(grs.scenarioId)),
      )
    ).filter((x) => x !== null);

    return guesses.map((guess) => ({
      ...guess,
      playerDisplayName:
        players.find((p) => p._id === guess.playerId)?.displayName ??
        "Unknown Player",
      guessedScenarioDescription:
        scenarios.find(
          (s) =>
            s._id ===
            gameRoundScenarios.find((grs) => grs._id === guess.scenarioId)
              ?.scenarioId,
        )?.description ?? "Unknown Scenario",
    }));
  },
});

export const getGuessesStatusForRound = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Get the game round
    const gameRound = await ctx.db.get(args.roundId);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Get all players in the game, excluding the host
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", gameRound.gameId))
      .collect();

    const nonHostPlayers = players.filter(
      (p) => p._id !== gameRound.hostPlayerId && p.active !== false,
    );

    // Get all guesses for the round
    const guesses = await ctx.db
      .query("gameRoundGuesses")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Now, for each non-host player, determine if they have guessed
    const playerGuesses = nonHostPlayers.map((p) => {
      return {
        player: p._id,
        displayName: p.displayName,
        hasGuessed: guesses.some((g) => g.playerId === p._id),
      };
    });

    // Check if all non-host players have guessed
    const nonHostPlayerIds = new Set(nonHostPlayers.map((p) => p._id));
    const guessingCompleteByAllUsers =
      nonHostPlayerIds.size === 0 ||
      [...nonHostPlayerIds].every((playerId) =>
        guesses.some((g) => g.playerId === playerId),
      );

    // Work out who is asking. This query used to need no identity at all, so a
    // missing one is treated as "not entitled to the tally" rather than an error
    // — the per-player checklist stays available to every caller as before.
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    const viewer = userId
      ? players.find((player) => player.userId === userId)
      : undefined;
    const viewerIsHost = viewer?._id === gameRound.hostPlayerId;
    const viewerHasGuessed = viewer
      ? guesses.some((guess) => guess.playerId === viewer._id)
      : false;

    // The tally goes only to callers who can no longer act on it: the host, who
    // knows the answer anyway, and guessers who have already committed. Anyone
    // still to guess would otherwise just copy the room.
    if (!viewerIsHost && !viewerHasGuessed) {
      return {
        guessingCompleteByAllUsers,
        playerGuesses,
        viewerHasGuessed,
        tally: null,
      };
    }

    const roundScenarios = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();
    const scenarioDocs = await Promise.all(
      roundScenarios.map((roundScenario) =>
        ctx.db.get(roundScenario.scenarioId),
      ),
    );

    // Every scenario is included, zero-count ones too, so rows never pop into
    // the list and shift it as votes land. Left in draw order — the same order
    // the guessers were shown — rather than sorted by count, which would make
    // rows jump on every vote and be harder to follow than the bars moving.
    const tally = roundScenarios.map((roundScenario, index) => ({
      scenarioId: roundScenario._id,
      description: scenarioDocs[index]?.description ?? "Unknown Scenario",
      count: guesses.filter((guess) => guess.scenarioId === roundScenario._id)
        .length,
    }));

    return {
      guessingCompleteByAllUsers,
      playerGuesses,
      viewerHasGuessed,
      tally,
    };
  },
});

export const makeGuessForRound = mutation({
  args: {
    game: v.id("games"),
    gameRound: v.id("gameRounds"),
    scenario: v.id("gameRoundScenarios"),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error(
        "User must be authenticated to select a game round scenario.",
      );
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.gameRound);
    if (!gameRound) {
      throw new Error("Game round does not exist");
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist");
    }

    // Make sure user is not round host
    if (userId === gameRoundHostPlayer.userId) {
      throw new Error("Game rounds hosts cannot submit guesses");
    }

    // Guesses are marked when the round moves to its reveal, so one landing
    // after that would stay unmarked. Before guessing opens there is nothing
    // to guess at.
    if (gameRound.phase !== "guess-scenario") {
      throw new Error("Guesses can only be made while the round is guessing.");
    }

    // Get the player associated with the user
    const player = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", args.game).eq("userId", userId),
      )
      .first();

    if (!player) {
      throw new Error(
        "Player associated with user in this game could not be found",
      );
    }

    // Make the guess
    await ctx.db.insert("gameRoundGuesses", {
      gameId: args.game,
      roundId: args.gameRound,
      scenarioId: args.scenario,
      playerId: player._id,
    });

    // The last guess reveals the results itself, marking them in the same
    // transaction, so the reveal doesn't wait on the host's browser, or never
    // come if the host has gone. "Everyone" is every active player bar the
    // host, as in getGuessesStatusForRound. The host's own auto-advance then
    // finds the phase already moved, which transitionRoundPhase allows.
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", gameRound.gameId))
      .collect();
    const guesses = await ctx.db
      .query("gameRoundGuesses")
      .withIndex("byRound", (q) => q.eq("roundId", gameRound._id))
      .collect();
    const everyoneHasGuessed = players
      .filter((p) => p._id !== gameRound.hostPlayerId && p.active !== false)
      .every((p) => guesses.some((guess) => guess.playerId === p._id));
    if (everyoneHasGuessed) {
      await advanceRoundPhase(ctx, gameRound, "display-results");
    }
  },
});

export const getCorrectAnswer = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // This query hands back the answer in plain text, so it is gated on the
    // round having actually reached its reveal. Otherwise any player could call
    // it directly during guess-scenario and skip the guessing entirely.
    const round = await ctx.db.get(args.roundId);
    if (!round) return null;
    if (round.phase !== "display-results" && round.phase !== "finished") {
      return null;
    }

    // get the gameRoundScenario for the round where `selected` is true
    const gameRoundScenario = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRoundSelected", (q) =>
        q.eq("roundId", args.roundId).eq("selected", true),
      )
      .first();
    if (!gameRoundScenario) {
      // throw new Error("No game round scenario for this round is selected as the correct answer!")
      return null;
    }

    // get the scenario
    const scenario = await ctx.db.get(gameRoundScenario.scenarioId);
    if (!scenario) {
      // throw new Error("The scenario selected for this game round does not exist")
      return null;
    }

    // return the scenario description
    return scenario.description;
  },
});

export const submitRating = mutation({
  args: { joinCode: v.string(), rating: v.number() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error(
        "User must be authenticated to submit a rating for the game.",
      );
    }

    // Obtain the game from the join code
    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (!game) {
      throw new Error("Game does not exist.");
    }

    // create game rating entry
    return await ctx.db.insert("gameRating", {
      gameId: game._id,
      userId: userId,
      rating: args.rating,
    });
  },
});

export const castPresenceVote = mutation({
  args: { joinCode: v.string(), targetPlayerId: v.id("players") },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to vote.");
    }

    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (!game) throw new Error("Game does not exist.");

    const caller = await ctx.db
      .query("players")
      .withIndex("byGameUser", (q) =>
        q.eq("gameId", game._id).eq("userId", userId),
      )
      .first();
    if (!caller || caller.active === false) {
      throw new Error("Only active players in the game can vote.");
    }

    const target = await ctx.db.get(args.targetPlayerId);
    if (!target || target.gameId !== game._id) {
      throw new Error("Target is not a player in this game.");
    }
    if (target._id === caller._id) {
      throw new Error("You cannot vote about yourself.");
    }

    // Consensus recovery only applies within an active round.
    const currentRoundNumber = game.currentRound;
    if (!currentRoundNumber) {
      return { resolved: false as const };
    }
    const round = await ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", game._id).eq("roundNumber", currentRoundNumber),
      )
      .unique();
    if (!round) {
      return { resolved: false as const };
    }

    const now = Date.now();
    const presence = await loadPresence(ctx, game._id);

    const existingVotes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", game._id).eq("targetPlayerId", target._id),
      )
      .collect();

    // If the target is back online, cancel any open vote and do nothing.
    if (isConnected(lastAliveFor(target, presence), now)) {
      await Promise.all(
        existingVotes.map((voteRow) => ctx.db.delete(voteRow._id)),
      );
      return { resolved: false as const };
    }

    const kind =
      round.hostPlayerId === target._id ? "reassign-host" : "remove-player";

    // Record the caller's vote (once per round).
    if (
      !existingVotes.some(
        (voteRow) =>
          voteRow.voterPlayerId === caller._id &&
          voteRow.roundNumber === currentRoundNumber,
      )
    ) {
      await ctx.db.insert("presenceVotes", {
        gameId: game._id,
        roundNumber: currentRoundNumber,
        targetPlayerId: target._id,
        voterPlayerId: caller._id,
        kind,
        createdAt: now,
      });
    }

    // Tally against currently-connected, active, non-target players.
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .collect();
    const connectedNonTarget = players.filter(
      (p) =>
        p._id !== target._id &&
        p.active !== false &&
        isConnected(lastAliveFor(p, presence), now),
    );
    const eligibleVoterIds = new Set(connectedNonTarget.map((p) => p._id));

    const votes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", game._id).eq("targetPlayerId", target._id),
      )
      .collect();
    const agreeing = new Set(
      votes
        .filter(
          (voteRow) =>
            voteRow.roundNumber === currentRoundNumber &&
            eligibleVoterIds.has(voteRow.voterPlayerId),
        )
        .map((voteRow) => voteRow.voterPlayerId),
    ).size;

    const denominator = connectedNonTarget.length;
    if (denominator === 0 || agreeing <= denominator / 2) {
      return { resolved: false as const };
    }

    // Majority reached and target confirmed stale — execute.
    if (kind === "reassign-host") {
      const newHostId = await pickHost(ctx, game._id, connectedNonTarget);
      await ctx.db.patch(round._id, { hostPlayerId: newHostId });
    } else {
      await ctx.db.patch(target._id, { active: false });
    }

    await Promise.all(votes.map((voteRow) => ctx.db.delete(voteRow._id)));
    return { resolved: true as const, action: kind };
  },
});
