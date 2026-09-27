"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import * as Editable from "@/components/ui/editable";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import { useSaveDisplayName } from "@/lib/use-display-name";
import PresenceDot from "@/components/game/presence/presence-dot";
import { Id } from "@/convex/_generated/dataModel";

// Liveness is not a prop: the dot reads it itself, so a heartbeat re-renders
// the dot and leaves the card alone. Props are primitives so the memoised cards
// skip re-rendering when the lobby does and their player hasn't changed.
interface PlayerCardProps {
  gameId: Id<"games">;
  playerId: Id<"players">;
  playerName: string;
  active?: boolean;
}

// Everyone else's card: read-only, so it needs neither the session nor the
// rename hook.
export const PlayerCard = React.memo(function PlayerCard({
  gameId,
  playerId,
  playerName,
  active,
}: PlayerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <PresenceDot gameId={gameId} playerId={playerId} active={active} />
          {playerName}
        </CardTitle>
      </CardHeader>
    </Card>
  );
});

// The viewer's own card, where they can rename themselves. The lobby picks it
// by user id, so only this one card subscribes to the session.
export const SelfPlayerCard = React.memo(function SelfPlayerCard({
  gameId,
  playerId,
  playerName,
  active,
}: PlayerCardProps) {
  const { save: saveDisplayName, ready } = useSaveDisplayName();

  // What is being typed, tagged with the server value it was typed over. The
  // tag is what keeps this honest: the moment `playerName` moves — a save
  // landing, or a rename made from the tray or another device — the draft no
  // longer matches and the card falls back to the name everyone else can see.
  // Deriving it this way rather than resetting in an effect means there is no
  // window where the card shows a name the server has already replaced.
  const [draft, setDraft] = React.useState<{
    base: string;
    value: string;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const value = draft?.base === playerName ? draft.value : playerName;

  const submitName = async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === playerName) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      const result = await saveDisplayName(trimmed);
      if (!result.ok) {
        // Put the card back to the name everyone else is still seeing rather
        // than leaving a name on screen that was never saved.
        setDraft(null);
        toast.error(result.message);
        return;
      }
      if (result.propagated) {
        toast.success("Display name updated");
        return;
      }
      // The account took the name but this row didn't, and the draft would sit
      // here showing it anyway until the next reload — the one state where this
      // card lies about what everyone else can see. Drop it and say so.
      setDraft(null);
      toast.warning("Display name updated", {
        description:
          "This card may still show the old name. Try again shortly.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <PresenceDot gameId={gameId} playerId={playerId} active={active} />
          <Editable.Root
            value={value}
            onValueChange={(next) =>
              setDraft({ base: playerName, value: next })
            }
            onSubmit={(next) => void submitName(next)}
            onCancel={() => setDraft(null)}
            disabled={saving || !ready}
            className="flex flex-1 flex-row items-center gap-1.5"
          >
            <Editable.Area className="flex-1">
              <Editable.Preview className={"w-full rounded-md px-1.5 py-1"} />
              {/* maxLength belongs on the input: EditableInput reads its own
                  prop, not the one Editable.Root puts on the context. */}
              <Editable.Input
                className="px-1.5 py-1"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
              />
            </Editable.Area>
            <Editable.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Change your display name"
              >
                <Edit />
              </Button>
            </Editable.Trigger>
          </Editable.Root>
        </CardTitle>
      </CardHeader>
    </Card>
  );
});
