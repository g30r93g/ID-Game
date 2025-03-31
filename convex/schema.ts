import { defineSchema, defineTable } from 'convex/server';
import { authTables } from "@convex-dev/auth/server";
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  players: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
    displayName: v.string(),
    lastAlive: v.number(),
  }).index('byGame', ['gameId'])
    .index('byUser', ['userId']),

  games: defineTable({
    joinCode: v.string(),
    totalRounds: v.number(),
    currentRound: v.optional(v.number()),
    isOpen: v.boolean(),
    createdBy: v.id("users"),
  }).index('byJoinCode', ['joinCode']),

  scenarios: defineTable({
    description: v.string(),
    category: v.string(),
  }).index('byCategory', ['category']),

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
      v.literal("finished")
    ),
  }).index('byGame', ['gameId'])
    .index('byHost', ['hostPlayerId'])
    .index('byGameRound', ['gameId', 'roundNumber']),

  gameRoundScenarios: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    scenarioId: v.id("scenarios"),
    selected: v.boolean(),
  }).index('byRound', ['roundId']),

  gameRoundPlayerRankings: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    playerId: v.id("players"),
    ranking: v.number(),
  }).index('byRound', ['roundId']),

  gameRoundGuesses: defineTable({
    gameId: v.id("games"),
    roundId: v.id("gameRounds"),
    scenarioId: v.id("gameRoundScenarios"),
    playerId: v.id("players"),
    isCorrect: v.optional(v.boolean()),
  }).index('byRound', ['roundId']),
});