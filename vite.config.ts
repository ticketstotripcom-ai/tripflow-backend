import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

export default defineConfig(async ({ mode }) => {
  let devPlugins: any[] = [];

  if (mode === "development") {
    try {
      const { componentTagger } = await import("lovable-tagger");
      devPlugins = [componentTagger()];
    } catch (error) {
      console.warn("lovable-tagger not installed; skipping componentTagger plugin");
    }
  }

  return {
    base: "./",
    server: {
      host: "0.0.0.0",
      port: 3000,
      // Optional HTTPS for local dev to avoid browser "Not secure" warnings
      // Generate certs with mkcert and place at certs/localhost.pem and certs/localhost-key.pem
      https: (() => {
        try {
          const keyPath = process.env.VITE_HTTPS_KEY || path.resolve(__dirname, "certs/localhost-key.pem");
          const certPath = process.env.VITE_HTTPS_CERT || path.resolve(__dirname, "certs/localhost.pem");
          if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            return {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath),
            } as any;
          }
        } catch {}
        return undefined;
      })(),
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "tripflow-backend-6xzr.onrender.com",
      ],
      https: (() => {
        try {
          const keyPath = process.env.VITE_HTTPS_KEY || path.resolve(__dirname, "certs/localhost-key.pem");
          const certPath = process.env.VITE_HTTPS_CERT || path.resolve(__dirname, "certs/localhost.pem");
          if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            return {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath),
            } as any;
          }
        } catch {}
        return undefined;
      })(),
    },
    plugins: [react(), ...devPlugins].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router-dom'],
            db: ['dexie'],
            sound: ['howler'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
