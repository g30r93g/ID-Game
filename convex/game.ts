import {mutation, query} from "./_generated/server";
import {v} from "convex/values";
import {Id} from "./_generated/dataModel";

function generateOTP(length = 6): string {
  const characters = 'ABCDEGHIKLMNPQRSTUVXYZ0123456789'; // some are missing to reduce ambiguity

  let otp = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    otp += characters[randomIndex];
  }
  return otp;
}

export const sendHeartbeat = mutation({
  handler: async (ctx) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier;
    if (!userId) {
      throw new Error("User must be authenticated to send a heartbeat.");
    }

    // Get the player associated with the user
    const player = await ctx.db
      .query("players")
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .first();

    if (!player) {
      throw new Error("No player found for authed user")
    }

    // Get the current time
    const now = Date.now();

    await ctx.db.patch(player._id, { lastAlive: now })
  }
})

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
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("userId"), user.tokenIdentifier))
      .first();

    return !!userPlayer;
  }
})

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
  }
})

export const createGame = mutation({
  args: { numberOfRounds: v.number() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const user = await ctx.auth.getUserIdentity()
    if (!user) {
      throw new Error("User must be authenticated to create a game.");
    }

    // create game
    const gameId = await ctx.db.insert("games", { joinCode: generateOTP(), totalRounds: args.numberOfRounds, isOpen: true, createdBy: user.tokenIdentifier });

    // add player who created game to game
    await ctx.db.insert("players", { userId: user.tokenIdentifier, gameId: gameId, lastAlive: Date.now(), displayName: user.name ?? `Unknown Player` })

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
      throw new Error("Game is not open to new players.")
    }

    // Only add user if not already in game
    const userPlayer = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("userId"), user.tokenIdentifier))
      .first();

    if (!userPlayer) {
      // Link player to game
      await ctx.db.insert("players", { userId: user.tokenIdentifier, gameId: game._id, lastAlive: Date.now(), displayName: user.name ?? `Unknown Player` })
    }
  }
})

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
      .withIndex("byGame", (q) => q.eq("gameId", args.gameId))
      .filter((q) => q.eq(q.field("userId"), user.tokenIdentifier))
      .first();
    if (!userPlayer) {
      return;
    }

    // Delete them from the list of players
    await ctx.db.delete(userPlayer._id);
  }
})

export const closeGameToNewPlayers = mutation({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.game, { isOpen: false });
  }
})

export const getPlayersForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .collect();
  }
})

export const getPlayerForCurrentUserForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    // Get current user
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated.");
    }

    // Match user to player in game
    return await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
  }
})

export const getGameRoundsForGame = query({
  args: { game: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameRounds")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .collect();
  }
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
        q.eq("gameId", args.game).eq("roundNumber", currentRoundNumber)
      )
      .unique();
  },
});

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
        q.eq("gameId", args.game).eq("roundNumber", currentRoundNumber)
      )
      .unique();
    if (!currentRound) return null;

    // get host for round
    return await ctx.db.get(currentRound.hostPlayerId)
  }
})

export const startNewGameRound = mutation({
  args: { game: v.id("games"), player: v.optional(v.id("players")) },
  handler: async (ctx, args) => {
    // Fetch current game to get the latest round number
    const game = await ctx.db.get(args.game);
    if (!game) throw new Error("Game not found.");

    // define the variable to hold the player
    let player: Id<'players'> | undefined;

    // determine the new round number
    const newRoundNumber = (game.currentRound ?? 0) + 1;
    console.log("newRoundNumber", newRoundNumber)

    // ensure new round number is not greater than the number of rounds set
    // if the game has zero rounds, it means it is an infinite game
    if (newRoundNumber > game.totalRounds) {
      return null;
    }

    // If player is manually provided, use it directly
    if (args.player) {
      const existingPlayer = await ctx.db.get(args.player);
      if (!existingPlayer || existingPlayer.gameId !== args.game) {
        throw new Error("Invalid player specified.");
      }

      player = existingPlayer._id;
    }

    // Step 0: If game has no rounds (newRoundNumber === 1), assign player that created game
    if (newRoundNumber === 1) {
      const creatorPlayer = await ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", args.game))
        .filter((q) => q.eq(q.field("userId"), game.createdBy))
        .first();

      if (creatorPlayer) {
        player = creatorPlayer._id;
      } else {
        throw new Error("No players within game to select as host")
      }
    }

    // if the player is still undefined, we randomly select one
    if (!player) {
      // Step 1: Get host counts directly from DB
      const hostCounts = new Map<string, number>();

      const rounds = await ctx.db
        .query("gameRounds")
        .withIndex("byGame", (q) => q.eq("gameId", args.game))
        .collect();

      rounds.forEach((round) => {
        if (round.hostPlayerId) {
          hostCounts.set(round.hostPlayerId, (hostCounts.get(round.hostPlayerId) || 0) + 1);
        }
      });

      // Step 2: Get the players in this game
      const players = await ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", args.game))
        .collect();

      if (players.length === 0) throw new Error("No players available.");

      // Step 3: Find the least hosted players
      const minHostingCount = Math.min(...players.map((p) => hostCounts.get(p._id) || 0));
      const leastHostedPlayers = players.filter((p) => (hostCounts.get(p._id) || 0) === minHostingCount);

      // Step 4: Randomly pick a host from the least-hosted players
      if (leastHostedPlayers.length > 0) {
        player = leastHostedPlayers[Math.floor(Math.random() * leastHostedPlayers.length)]._id;
      }
    }

    // ensure player is defined
    if (!player) {
      // this should never run
      throw new Error("Next host player indeterminate")
    }

    const newGameRound = await ctx.db.insert("gameRounds", {
      gameId: game._id,
      roundNumber: newRoundNumber,
      hostPlayerId: player,
      phase: "create-scenarios"
    });

    // update the round number
    await ctx.db.patch(game._id, { currentRound: newRoundNumber });

    return newGameRound;
  },
});

export const scenarioCategories = query({
  handler: async (ctx) => {
    const scenarios = await ctx.db
      .query("scenarios")
      .collect();

    // Extract unique categories
    return [...new Set(scenarios.map((s) => s.category))];
  }
})

export const gameRoundScenarios = query({
  args: { gameRound: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Fetch all gameRoundScenarios entries for the given game round
    const scenarios = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.gameRound))
      .collect();

    // Get all scenarioIds
    const scenarioIds = scenarios.map((s) => s.scenarioId);

    // Fetch each scenario individually
    const scenarioDocs = await Promise.all(
      scenarioIds.map((id) => ctx.db.get(id))
    );

    // Map scenario documents by ID for quick lookup
    const scenarioMap = new Map(
      scenarioDocs.filter(Boolean).map((s) => [s!._id, s])
    );

    // Attach scenario details to each gameRoundScenario entry
    return scenarios.map((scenario) => ({
      ...scenario,
      scenarioDetails: scenarioMap.get(scenario.scenarioId) ?? null, // Ensure graceful fallback
    }));
  },
});

export const selectScenariosForGameRound = mutation({
  args: { game: v.id("games"), gameRound: v.id("gameRounds"), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Fetch scenarios, leveraging index if a category is specified
    const query = args.category
      ? ctx.db.query("scenarios").withIndex("byCategory", (q) => q.eq("category", args.category!))
      : ctx.db.query("scenarios");

    const scenarios = await query.collect();

    if (scenarios.length < 10) {
      throw new Error("Not enough scenarios available in the selected category.");
    }

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
        })
      )
    );

    return true;
  },
});

export const transitionRoundPhase = mutation({
  args: {
    gameRoundId: v.id("gameRounds"),
    toPhase: v.union(
      v.literal("create-scenarios"),
      v.literal("pick-scenario"),
      v.literal("rank-players"),
      v.literal("guess-scenario"),
      v.literal("display-results"),
      v.literal("finished")
    )
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to create a game.");
    }

    // Get game round referenced
    const gameRound = await ctx.db.get(args.gameRoundId);
    if (!gameRound) {
      throw new Error("Game round does not exist")
    }

    // Ensure current user is the round host
    const gameRoundHostPlayer = await ctx.db.get(gameRound.hostPlayerId);
    if (!gameRoundHostPlayer) {
      throw new Error("Game round host does not exist")
    }

    if (userId !== gameRoundHostPlayer.userId) {
      throw new Error("Only game round host can transition a game round")
    }

    // change phase
    await ctx.db.patch(gameRound._id, { phase: args.toPhase });
  }
});

export const selectGameRoundScenario = mutation({
  args: { gameRoundId: v.id("gameRounds"), gameRoundScenarioId: v.id("gameRoundScenarios") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to select a game round scenario.");
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
      throw new Error("Only the game round host can select the round's scenario");
    }

    // Ensure game round scenario exists
    const selectedGameRoundScenario = await ctx.db.get(args.gameRoundScenarioId);
    if (!selectedGameRoundScenario || selectedGameRoundScenario.roundId !== args.gameRoundId) {
      throw new Error("Invalid game round scenario");
    }

    // Unselect any previously selected scenario for this game round
    const selectedScenariosForRound = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.gameRoundId))
      .filter((q) => q.field('selected'))
      .collect();

    if (selectedScenariosForRound.length > 0) {
      throw new Error("A scenario has already beeen selected.");
    }

    // Change selected state for the chosen scenario
    await ctx.db.patch(args.gameRoundScenarioId, { selected: true });
  },
});

export const submitPlayerRankingsForGameRound = mutation({
  args: { gameId: v.id("games"), roundId: v.id("gameRounds"), rankings: v.array(v.object({ ranking: v.number(), playerId: v.id("players") })) },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to select a game round scenario.");
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
    await Promise.all(args.rankings.map((r) => {
      return ctx.db.insert("gameRoundPlayerRankings", {
        ...r,
        gameId: args.gameId,
        roundId: args.roundId
      })
    }));
  }
})

export const getPlayerRankingsForRound = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Get rankings for the specified round
    const rankings = await ctx.db
      .query("gameRoundPlayerRankings")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Get player IDs from rankings
    const players = (await Promise.all(
      rankings.map((ranking) => ctx.db.get(ranking.playerId))
    )).filter((x) => x !== null);

    // Combine rankings with player display names
    return rankings.map((ranking) => ({
      ...ranking,
      playerDisplayName: players.find((p) => p._id === ranking.playerId)?.displayName ?? "Unknown Player",
    }));
  }
});

export const markGuessesForRound = mutation({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to select a game round scenario.");
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

  // Fetch all guesses for this round
    const guesses = await ctx.db
      .query("gameRoundGuesses")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Get the selected scenario for the game round (assuming one selected scenario per round)
    const selectedScenario = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .filter((q) => q.field("selected"))
      .first();

    if (!selectedScenario) {
      throw new Error("No selected scenario found for this round");
    }

    // Determine correct guesses by comparing the guessed scenario ID with the selected scenario ID
    const updatedGuesses = guesses.map((guess) => {
      const isCorrect = guess.scenarioId === selectedScenario._id;

      return {
        ...guess,
        isCorrect: isCorrect,
      };
    });

    // Update all guesses with the 'correct' field
    await Promise.all(
      updatedGuesses.map((guess) =>
        ctx.db.patch(guess._id, { isCorrect: guess.isCorrect })
      )
    );
  }
})

export const getGuessesForRound = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    const guesses = await ctx.db
      .query("gameRoundGuesses")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Get player details
    const players = (await Promise.all(
      guesses.map((g) => ctx.db.get(g.playerId))
    )).filter((x) => x !== null);

    // Get gameRoundScenario documents
    const gameRoundScenarios = (await Promise.all(
      guesses.map((g) => g.scenarioId ? ctx.db.get(g.scenarioId) : null)
    )).filter((x) => x !== null);

    // Get actual scenario documents
    const scenarios = (await Promise.all(
      gameRoundScenarios.map((grs) => ctx.db.get(grs.scenarioId))
    )).filter((x) => x !== null);

    return guesses.map((guess) => ({
      ...guess,
      playerDisplayName: players.find((p) => p._id === guess.playerId)?.displayName ?? "Unknown Player",
      guessedScenarioDescription: scenarios.find((s) => s._id ===
        gameRoundScenarios.find((grs) => grs._id === guess.scenarioId)?.scenarioId
      )?.description ?? "Unknown Scenario"
    }));
  }
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

    const nonHostPlayers = players.filter(p => p._id !== gameRound.hostPlayerId);

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
        hasGuessed: guesses.find((g) => g.playerId === p._id) ?? false
      }
    })

    // Check if all non-host players have guessed
    const nonHostPlayerIds = new Set(nonHostPlayers.map(p => p._id));
    const guessingCompleteByAllUsers = nonHostPlayerIds.size === 0 ||
      [...nonHostPlayerIds].every(playerId => guesses.some(g => g.playerId === playerId));

    return { guessingCompleteByAllUsers, playerGuesses };
  }
});

export const makeGuessForRound = mutation({
  args: { game: v.id("games"), gameRound: v.id("gameRounds"), scenario: v.id("gameRoundScenarios") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to select a game round scenario.");
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

    // Get the player associated with the user
    const player = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", args.game))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (!player) {
      throw new Error("Player associated with user in this game could not be found")
    }

    // Make the guess
    await ctx.db.insert("gameRoundGuesses", {
      gameId: args.game,
      roundId: args.gameRound,
      scenarioId: args.scenario,
      playerId: player._id
    });
  }
})

export const getCorrectAnswer = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, args) => {
    // get the gameRoundScenario for the round where `selected` is true
    const gameRoundScenario = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", args.roundId))
      .filter((q) => q.eq(q.field("selected"), true))
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
  }
})

export const submitRating = mutation({
  args: { joinCode: v.string(), rating: v.number() },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier
    if (!userId) {
      throw new Error("User must be authenticated to submit a rating for the game.");
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
      rating: args.rating
    })
  }
})