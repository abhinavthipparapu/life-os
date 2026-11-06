import { Button } from "@lifeos/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@lifeos/ui/components/dialog";
import { cn } from "@lifeos/ui/lib/utils";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognizerClass = new () => Recognizer;

function recognizerClass(): RecognizerClass | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: RecognizerClass;
    webkitSpeechRecognition?: RecognizerClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const NOTICE_KEY = "lifeos.voiceNoticeSeen";

function noticeSeen() {
  try {
    return localStorage.getItem(NOTICE_KEY) === "true";
  } catch {
    return false;
  }
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow microphone access in your browser settings to use voice.",
  "service-not-allowed": "Voice isn't available in this browser right now.",
  "audio-capture": "No microphone was found.",
  network: "Voice needs an internet connection. You can still type.",
  "no-speech": "We didn't hear anything. Try again.",
};

/**
 * Speaks into a text field using the browser's own speech service, so it costs nothing to run.
 * Renders nothing where the browser doesn't support it, leaving typing as the way in.
 */
export function VoiceInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const [listening, setListening] = useState(false);
  const [asking, setAsking] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const Recognizer = recognizerClass();

  useEffect(() => () => recognizer.current?.abort(), []);

  if (!Recognizer) return null;

  const listen = () => {
    const base = value.trim();
    const session = new Recognizer();
    session.lang = navigator.language;
    session.continuous = false;
    session.interimResults = true;
    session.onresult = (event) => {
      let spoken = "";
      for (let i = 0; i < event.results.length; i += 1) {
        spoken += event.results[i]?.[0]?.transcript ?? "";
      }
      onChange(`${base} ${spoken}`.trim());
    };
    session.onerror = (event) => {
      if (event.error === "aborted") return;
      toast.error(ERRORS[event.error] ?? "Voice didn't work. You can still type.");
    };
    session.onend = () => setListening(false);
    recognizer.current = session;
    try {
      session.start();
      setListening(true);
    } catch {
      toast.error("Voice didn't work. You can still type.");
    }
  };

  const press = () => {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    if (noticeSeen()) listen();
    else setAsking(true);
  };

  const accept = () => {
    try {
      localStorage.setItem(NOTICE_KEY, "true");
    } catch {
      // Storage can be unavailable in private windows. The notice simply shows again.
    }
    setAsking(false);
    listen();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={listening ? "Stop listening" : label}
        aria-pressed={listening}
        className={cn(listening && "border-danger text-danger")}
        onClick={press}
      >
        {listening ? (
          <Square aria-hidden className="size-4 animate-pulse" />
        ) : (
          <Mic aria-hidden className="size-4" />
        )}
      </Button>
      <span role="status" className="sr-only">
        {listening ? "Listening" : ""}
      </span>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use your voice</DialogTitle>
            <DialogDescription>
              Your browser turns your speech into text, and its provider, such as Google or Apple,
              may process the audio. LifeOS never records or stores your voice. Avoid saying
              anything very personal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={accept}>
              Continue
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setAsking(false)}>
              Not now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
