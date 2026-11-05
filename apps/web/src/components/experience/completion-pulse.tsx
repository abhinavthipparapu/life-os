import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Spring scale 0.94 to 1.05 to 1 over about 250ms (section 2.1). Motion owns this element's transform. */
export function CompletionPulse({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.span
      className="inline-flex"
      animate={active ? { scale: [0.94, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.span>
  );
}

export function haptic() {
  if ("vibrate" in navigator) navigator.vibrate(10);
}
