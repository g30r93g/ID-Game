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

// Daily is plenty: an unusable guest costs a row, nothing more. A backlog
// bigger than one batch carries on in follow-up runs straight away.
crons.daily(
  "delete expired guests",
  { hourUTC: 4, minuteUTC: 17 },
  internal.cleanup.deleteExpiredGuests,
  {},
);

// Refunds player generations whose action died mid-run. Ten minutes is
// plenty: a credit stuck pending only blocks that round's host until it runs.
crons.interval(
  "refund stale scenario generations",
  { minutes: 10 },
  internal.generation.sweepStaleGenerations,
  {},
);

export default crons;
