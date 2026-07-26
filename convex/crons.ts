import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly is enough: the join screen enforces the continuable rules live on
// every read, so this only keeps the derived state (admin `activeNow`, the
// `createGame` dedupe) current.
crons.interval(
  "mark abandoned games",
  { hours: 1 },
  internal.cleanup.markAbandonedGames,
  {},
);

export default crons;
