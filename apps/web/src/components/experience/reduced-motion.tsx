import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/app/api";

const Context = createContext({ reduced: false, celebrations: true });

export const useExperience = () => useContext(Context);

/** One decision point: honors the operating system setting and the user's own preference. */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const system = useReducedMotion();
  const { data } = api.endpoints.me.useQueryState();
  const prefs = data?.preferences;
  const reduced = Boolean(system || prefs?.reducedMotion);
  return (
    <Context.Provider value={{ reduced, celebrations: prefs?.celebrations ?? true }}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>
    </Context.Provider>
  );
}
