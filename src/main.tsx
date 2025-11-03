import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register Workbox-generated service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      console.log("✅ Service Worker registered with scope:", registration.scope);

      // Listen for updates to the service worker
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                console.log("🆕 New content available; please refresh.");
                // Optionally show a toast or prompt user to refresh
              } else {
                console.log("🎉 Content cached for offline use.");
              }
            }
          };
        }
      };
    } catch (error) {
      console.error("❌ Service Worker registration failed:", error);
    }
  });
} else {
  console.log("⚠️ Service workers are not supported in this browser.");
}

createRoot(document.getElementById("root")!).render(<App />);
