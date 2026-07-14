import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    userId: v.string(),
    gameId: v.id("games"),
    displayName: v.string(),
    lastAlive: v.number(),
  })
    .index("byGame", ["gameId"])
    .index("byUser", ["userId"]),

  games: defineTable({
    joinCode: v.string(),
    totalRounds: v.number(),
    currentRound: v.optional(v.number()),
    isOpen: v.boolean(),
    createdBy: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("byJoinCode", ["joinCode"])
    .index("byIsOpen", ["isOpen"])
    .index("byStartedAt", ["startedAt"])
    .index("byCompletedAt", ["completedAt"]),

  scenarios: defineTable({
    description: v.string(),
    category: v.string(),
    timesSelected: v.optional(v.number()),
  })
    .index("byCategory", ["category"])
    .index("byTimesSelected", ["timesSelected"]),

  // Managed controlled-vocabulary of scenario categories. A category can exist
  // here before any scenario uses it (created via the admin "Manage categories"
  // dialog). `name` is unique (enforced in the mutations, looked up by index).
  scenarioCategories: defineTable({
    name: v.string(),
  }).index("byName", ["name"]),

  gameRounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    hostPlayerId: v.id("players"),
    phase: v.union(
      v.literal("create-scenarios"),
      v.literal("pick-scenario"),
      v.literal("rank-players"),
      v.literal("guess-scenario"),
      v.literal("display-results"),
      v.literal("finished"),
    ),
  })
    .index("byGame", ["gameId"])
    .index("byHost", ["hostPlayerId"])
    .index("byGameRound", ["gameId", "roundNumber"]),

  gameRoundScenarios: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    scenarioId: v.id("scenarios"),
    selected: v.boolean(),
  }).index("byRound", ["roundId"]),

  gameRoundPlayerRankings: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    playerId: v.id("players"),
    ranking: v.number(),
  }).index("byRound", ["roundId"]),

  gameRoundGuesses: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    scenarioId: v.id("gameRoundScenarios"),
    playerId: v.id("players"),
    isCorrect: v.optional(v.boolean()),
  }).index("byRound", ["roundId"]),

  gameRating: defineTable({
    gameId: v.id("games"),
    userId: v.string(),
    rating: v.number(),
  }),
});
