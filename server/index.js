import { createApp } from "./app.js";
process.umask(0o077);
const app = await createApp({
  clientId: process.env.GOOGLE_CLIENT_ID,
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  allowedEmail: process.env.ALLOWED_EMAIL,
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  databasePath: process.env.DATABASE_PATH || "./data/panxa.sqlite",
  production: process.env.NODE_ENV === "production",
  serveWeb: process.env.NODE_ENV === "production",
});
try {
  await app.listen({
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.API_PORT || 3002),
  });
  console.log("API de PANXA preparada.");
} catch (e) {
  console.error("No s’ha pogut iniciar l’API de PANXA:", e.message);
  await app.close();
  process.exitCode = 1;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
