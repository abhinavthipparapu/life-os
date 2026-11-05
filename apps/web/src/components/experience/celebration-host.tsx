import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ui, useAppDispatch, useAppSelector } from "@/app/store";
import { ConfettiBurst, PlannerHero } from "./confetti-burst";
import { useExperience } from "./reduced-motion";

/** Reacts only to server-confirmed results, so state is always saved before any celebration. */
export function CelebrationHost() {
  const dispatch = useAppDispatch();
  const celebration = useAppSelector((s) => s.ui.celebration);
  const { celebrations } = useExperience();
  const [burst, setBurst] = useState(false);
  const [hero, setHero] = useState<string | null>(null);
  const endBurst = useCallback(() => setBurst(false), []);

  useEffect(() => {
    if (!celebration) return;
    for (const a of celebration.achievements)
      toast.success(a.title, { description: a.description });
    if (celebrations) {
      if (celebration.plannerCompleted) setHero(celebration.plannerCompleted.name);
      else if (celebration.dayComplete) setBurst(true);
    }
    dispatch(ui.actions.celebrate(null));
  }, [celebration, celebrations, dispatch]);

  return (
    <>
      {burst && <ConfettiBurst onDone={endBurst} />}
      {hero && <PlannerHero name={hero} onClose={() => setHero(null)} />}
    </>
  );
}
