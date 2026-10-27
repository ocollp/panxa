import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // Explicit allowlist: never embed .env, client secrets, or server settings.
  const config = {
    clientId: env.GOOGLE_CLIENT_ID || "",
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID || "",
    allowedEmail: env.ALLOWED_EMAIL || "",
  };
  if (command === "build" && Object.values(config).some((value) => !value))
    throw new Error(
      "Configura GOOGLE_CLIENT_ID, GOOGLE_SPREADSHEET_ID i ALLOWED_EMAIL abans de compilar.",
    );
  return {
    base: "/panxa/",
    define: { __PANXA_CONFIG__: JSON.stringify(config) },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
  };
});
