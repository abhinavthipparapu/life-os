import { Toaster } from "@lifeos/ui/components/sonner";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { router } from "@/app/router";
import { store } from "@/app/store";
import { SessionProvider } from "@/features/auth/session";
import "@/styles/index.css";

registerSW({ immediate: true });

if (import.meta.env.VITE_SENTRY_DSN) {
  void import("@sentry/react").then((Sentry) =>
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN as string,
      dataCollection: { userInfo: false, httpBodies: [] },
    }),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <SessionProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" expand visibleToasts={5} />
      </SessionProvider>
    </Provider>
  </StrictMode>,
);
