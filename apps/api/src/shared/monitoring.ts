// Sentry loads only when a DSN is configured, so local runs and tests send nothing anywhere.
type Capture = (err: unknown) => void;
let capture: Capture = () => undefined;

export async function initMonitoring(dsn: string | undefined, environment: string) {
  if (!dsn) return;
  const Sentry = await import("@sentry/node");
  // Error reports must never carry personal or health data (section 13).
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0.1,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      stackFrameVariables: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
    },
  });
  capture = (err) => Sentry.captureException(err);
}

export const reportError: Capture = (err) => capture(err);
