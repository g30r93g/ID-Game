import RatingCard from "@/components/game/rate";
import {redirect} from "next/navigation";

export default async function RateGamePage({ params }: { params?: Promise<{ code: string }> }) {
  const joinCode = (await params)?.code;
  if (!joinCode) {
    console.error("No game code supplied")
    redirect('/game');
  }

  return (
    <div className={"w-full md:w-[75%] items-center flex flex-col gap-4"}>
      <RatingCard joinCode={joinCode} />
    </div>
  )
}