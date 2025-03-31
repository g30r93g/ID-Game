import {Loader2} from "lucide-react";

export default function WaitGamePhase() {
  return (
    <div className={"flex items-center justify-center"}>
      <Loader2 className={"h-8 w-8 animate-spin"} />
    </div>
  )
}
