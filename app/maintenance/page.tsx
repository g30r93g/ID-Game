import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Back soon — The ID Game",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-svh flex items-center justify-center px-4">
      <Card className="w-full sm:w-96 text-center">
        <CardHeader>
          <CardTitle className="text-2xl">We&apos;ll be back soon 🔧</CardTitle>
          <CardDescription>
            We&apos;re working away on a new version of The ID Game.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Check back in a little while and start a fresh game.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
