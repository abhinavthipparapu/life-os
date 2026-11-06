import { Button } from "@lifeos/ui/components/button";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface ClipProps {
  clip: string;
  title: string;
  alt: string;
  eager?: boolean;
}

/**
 * A real recording of the app, in a browser-style frame. It plays only while on screen, can always
 * be paused, and is a still image for anyone who has asked for reduced motion.
 */
export function ProductClip({ clip, title, alt, eager = false }: ClipProps) {
  const still = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element || paused) {
      element?.pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void element.play().catch(() => undefined);
        else element.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [paused, clip]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-surface shadow-e3">
      <div className="flex min-h-9 items-center gap-1.5 border-b bg-surface-2 pr-1 pl-3">
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        <span aria-hidden className="size-2.5 rounded-full bg-line" />
        {!still && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={`${paused ? "Play" : "Pause"} ${title}`}
            onClick={() => setPaused(!paused)}
          >
            {paused ? (
              <Play aria-hidden className="size-4" />
            ) : (
              <Pause aria-hidden className="size-4" />
            )}
          </Button>
        )}
      </div>
      {still ? (
        <img
          src={`/guide/${clip}.png`}
          alt={alt}
          width={1120}
          height={700}
          loading={eager ? "eager" : "lazy"}
          className="h-auto w-full"
        />
      ) : (
        <video
          ref={video}
          key={clip}
          aria-label={alt}
          src={`/guide/${clip}.mp4`}
          poster={`/guide/${clip}.png`}
          width={1120}
          height={700}
          muted
          loop
          playsInline
          preload={eager ? "auto" : "none"}
          className="h-auto w-full"
        />
      )}
    </div>
  );
}
