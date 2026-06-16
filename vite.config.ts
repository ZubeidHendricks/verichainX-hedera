import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    viteStaticCopy({
      targets: [
        { src: "./assets/*", dest: "assets" },
        {
          src: "./public/assets/**/*",
          dest: "public/assets",
        },
      ],
      silent: true,
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        // Split heavy dependencies into separate chunks so the main app bundle
        // stays small and vendor code can be cached independently.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mui/x-")) return "mui-x";
          if (id.includes("@mui") || id.includes("@emotion")) return "mui";
          if (id.includes("recharts") || id.includes("d3")) return "charts";
          if (id.includes("react-router")) return "router";
          if (id.includes("redux") || id.includes("reduxjs")) return "redux";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor";
          return "vendor-misc";
        }
      }
    }
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true
  }
});
