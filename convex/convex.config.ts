import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(resend);
app.use(migrations);
// Account and guest counts for the admin users page (convex/userCounts.ts).
app.use(aggregate, { name: "userCounts" });

export default app;
