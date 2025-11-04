import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
      port: 8080,
    },
    preview: {
      host: "0.0.0.0",
      port: 8080,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "tripflow-backend-6xzr.onrender.com",
      ],
    },
    plugins: [react(), ...devPlugins].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
