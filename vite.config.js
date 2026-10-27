import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${env.API_PORT || 3002}` } },
    },
  };
});
