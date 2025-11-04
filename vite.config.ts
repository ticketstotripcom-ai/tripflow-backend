import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
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
      host: "::",
      port: 8080,
    },
    preview: {
      host: "::",
      port: 8080,
      allowedHosts: ["tripflow-backend-6xzr.onrender.com"], // ✅ Allow Render backend URL
    },
    plugins: [react(), ...devPlugins].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
