import CreateJoinGame from "@/components/create-join-game";

export default async function CreateJoinGamePage({ searchParams }: { searchParams: Promise<{ joinCode?: string }> }) {
  const joinCode = (await searchParams).joinCode;

  return <CreateJoinGame joinCode={joinCode} />;
}
