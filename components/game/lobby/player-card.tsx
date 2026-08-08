"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import * as Editable from "@/components/ui/editable";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import { useSaveDisplayName } from "@/lib/use-display-name";
import PresenceDot from "@/components/game/presence/presence-dot";

interface PlayerCardProps {
  playerUserId: string;
  playerName: string;
  lastAlive: number;
  active?: boolean;
}

export default function PlayerCard({
  playerUserId,
  playerName,
  lastAlive,
  active,
}: PlayerCardProps) {
  const { data: session } = authClient.useSession();
  const saveDisplayName = useSaveDisplayName();

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

  const isCurrentUser = playerUserId === session?.user.id;

  const submitName = async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === playerName) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      const message = await saveDisplayName(trimmed);
      if (message) {
        // Put the card back to the name everyone else is still seeing rather
        // than leaving a name on screen that was never saved.
        setDraft(null);
        toast.error(message);
        return;
      }
      toast.success("Display name updated");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <PresenceDot lastAlive={lastAlive} active={active} />
          {isCurrentUser ? (
            <Editable.Root
              value={value}
              onValueChange={(next) =>
                setDraft({ base: playerName, value: next })
              }
              onSubmit={(next) => void submitName(next)}
              onCancel={() => setDraft(null)}
              disabled={saving}
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
          ) : (
            playerName
          )}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
