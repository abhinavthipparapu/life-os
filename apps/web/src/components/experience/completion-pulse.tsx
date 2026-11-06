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

/**
 * Draws a line across the text from left to right as it fades. The line animates transform and the
 * text animates opacity, so they never compete, and reduced motion makes both instant.
 */
export function StrikeText({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className="relative inline-block max-w-full truncate align-bottom">
      <motion.span
        initial={false}
        animate={{ opacity: done ? 0.7 : 1 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.span>
      <motion.span
        aria-hidden
        data-testid="strike-line"
        className="absolute inset-x-0 top-1/2 h-0.5 origin-left rounded-full bg-current"
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      />
    </span>
  );
}
