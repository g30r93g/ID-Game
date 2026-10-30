import { notFound } from "next/navigation";
import { GenerateScenariosPreview } from "./preview";

// PROTOTYPE — a dev-only page for the "Make your own" scenario generation UI,
// driven entirely by mock data. Never served in production.
export default function GenerateScenariosPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GenerateScenariosPreview />;
}
