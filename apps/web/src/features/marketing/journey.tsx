import { Button } from "@lifeos/ui/components/button";
import { ArrowRight, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const CHAPTERS = [
  {
    clip: "signup",
    moment: "Day one",
    title: "It starts with a decision",
    text: "You're done keeping your life in five different apps and your head. A minute later, you have one place for all of it.",
    alt: "Filling in the signup form, seeing the verify email screen, then arriving at the home page.",
  },
  {
    clip: "build",
    moment: "That evening",
    title: "You shape it around your life",
    text: "No fixed categories and no one else's system. You add what matters to you, on the days that suit you.",
    alt: "Creating a planner, adding a task and scheduling it for Saturdays.",
  },
  {
    clip: "template",
    moment: "Short on ideas?",
    title: "You borrow a good starting point",
    text: "Open a ready-made plan, look it over, and make it yours. Your copy is yours to change completely.",
    alt: "Previewing the Career growth template and installing it as a planner.",
  },
  {
    clip: "ai",
    moment: "Short on time?",
    title: "You just describe what you want",
    text: "Tell the assistant your goal and review its draft. Nothing is created until you say so. Example shown.",
    alt: "Typing a request, reviewing a draft study plan, then approving it.",
  },
  {
    clip: "today",
    moment: "Every morning",
    title: "You show up, one tick at a time",
    text: "Today shows only what matters today. Tick it off, and finish the day feeling it.",
    alt: "Ticking off tasks on the Today page until the day is complete.",
  },
  {
    clip: "offline",
    moment: "On the train",
    title: "Life doesn't wait for signal",
    text: "Keep going without a connection. Your progress catches up the moment you're back online.",
    alt: "Completing a task while offline, then watching it sync on reconnecting.",
  },
  {
    clip: "insights",
    moment: "A few weeks later",
    title: "You look back and see how far you've come",
    text: "Real numbers, honestly counted. Rest days don't count against you, and every streak is one you earned.",
    alt: "Scrolling through analytics charts and a personal dashboard.",
  },
];

type Chapter = (typeof CHAPTERS)[number];

/** Moving images autoplay only if the visitor allows motion, and can always be paused. */
function AppWindow({ chapter, eager = false }: { chapter: Chapter; eager?: boolean }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border bg-surface shadow-e3">
      <div className="flex items-center gap-1.5 border-b bg-surface-2 py-0.5 pr-1 pl-3">
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto motion-reduce:invisible"
          aria-label={`${paused ? "Play" : "Pause"} ${chapter.title}`}
          onClick={() => setPaused(!paused)}
        >
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
        </Button>
      </div>
      <picture>
        {!paused && (
          <source
            media="(prefers-reduced-motion: no-preference)"
            srcSet={`/guide/${chapter.clip}.gif`}
          />
        )}
        <img
          src={`/guide/${chapter.clip}.png`}
          alt={chapter.alt}
          width={800}
          height={500}
          loading={eager ? "eager" : "lazy"}
          className="h-auto w-full bg-cover"
          style={{ backgroundImage: `url(/guide/${chapter.clip}.png)` }}
        />
      </picture>
    </div>
  );
}

/** One app window stays in view while the story scrolls past it. */
export function Journey() {
  const [active, setActive] = useState(0);
  const story = useRef<HTMLOListElement>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: story, offset: ["start center", "end center"] });
  const current = CHAPTERS[active]!;

  // Fetches the next clip early, so it plays the moment its chapter arrives.
  useEffect(() => {
    const next = CHAPTERS[active + 1];
    if (next && !still) new Image().src = `/guide/${next.clip}.gif`;
  }, [active, still]);

  return (
    <section aria-labelledby="journey" className="pt-8 pb-16">
      <div className="mx-auto max-w-xl text-center">
        <h2 id="journey" className="text-3xl font-semibold tracking-tight">
          See how it fits into your life
        </h2>
        <p className="mt-2 text-ink-muted">One person, one plan, a few weeks of showing up.</p>
      </div>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
        <ol ref={story} className="relative">
          <div
            aria-hidden
            className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full bg-line"
          >
            <motion.div
              className="h-full w-full origin-top rounded-full bg-primary"
              style={{ scaleY: still ? 1 : scrollYProgress }}
            />
          </div>
          {CHAPTERS.map((chapter, i) => (
            <motion.li
              key={chapter.clip}
              className="relative flex flex-col justify-center pb-12 pl-8 lg:min-h-[70vh] lg:pb-0"
              viewport={{ margin: "-45% 0px -45% 0px" }}
              onViewportEnter={() => setActive(i)}
            >
              <span
                aria-hidden
                className={`absolute top-1.5 left-0 size-4 rounded-full border-2 border-primary transition-colors lg:top-1/2 lg:-mt-2 ${
                  i <= active ? "bg-primary" : "bg-surface"
                }`}
              />
              <motion.div
                initial={still ? false : { opacity: 0.35, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-30% 0px -30% 0px" }}
                transition={{ duration: 0.4 }}
              >
                <p className="text-sm font-medium text-primary">{chapter.moment}</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight">{chapter.title}</h3>
                <p className="mt-2 text-ink-muted">{chapter.text}</p>
              </motion.div>
              <div className="mt-4 lg:hidden">
                <AppWindow chapter={chapter} />
              </div>
            </motion.li>
          ))}
        </ol>
        <div className="hidden lg:block">
          <div className="sticky top-[calc(50vh-13rem)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.clip}
                initial={still ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={still ? undefined : { opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AppWindow chapter={current} eager />
              </motion.div>
            </AnimatePresence>
            <p className="mt-3 text-center text-sm text-ink-muted" aria-live="polite">
              {active + 1} of {CHAPTERS.length}: {current.title}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center lg:mt-20">
        <h3 className="text-2xl font-semibold tracking-tight">Your journey starts with one tick</h3>
        <Button size="lg" className="mt-4" asChild>
          <Link to="/signup">
            Start yours today
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
