import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import * as Editable from "@/components/ui/editable";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import PresenceDot from "@/components/game/presence/presence-dot";

interface PlayerCardProps {
  playerId: string;
  playerUserId: string;
  playerName: string;
  lastAlive: number;
  active?: boolean;
}

export default function PlayerCard({
  playerId,
  playerUserId,
  playerName,
  lastAlive,
  active,
}: PlayerCardProps) {
  const { data: session } = authClient.useSession();

  // const updatePlayerDisplayName = useCallback(async (value: string) => {
  // }, [])

  const currentUserIsHostPlayer = () => {
    const userId = session?.user.id;

    if (!userId) return false;

    return playerUserId === userId;
  };

  return (
    <Card key={playerName}>
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <PresenceDot lastAlive={lastAlive} active={active} />
          {currentUserIsHostPlayer() ? (
            <Editable.Root
              key={playerId}
              defaultValue={playerName}
              // onSubmit={(value) => updatePlayerDisplayName(value)}
              className="flex flex-1 flex-row items-center gap-1.5"
            >
              <Editable.Area className="flex-1">
                <Editable.Preview className={"w-full rounded-md px-1.5 py-1"} />
                <Editable.Input className="px-1.5 py-1" />
              </Editable.Area>
              <Editable.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
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
