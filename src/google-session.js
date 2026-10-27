export function createGoogleSession({
  allowedEmail,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let grant = null;
  let generation = 0;
  return {
    clear() {
      generation++;
      grant = null;
    },
    token() {
      if (!grant || grant.expires <= now()) {
        const error = new Error(
          "Torna a connectar amb Google per continuar. El formulari es conserva.",
        );
        error.statusCode = 428;
        throw error;
      }
      return grant.token;
    },
    async connect(response) {
      const attempt = ++generation;
      grant = null;
      const scopes = new Set((response.scope || "").split(" "));
      if (
        response.error ||
        !response.access_token ||
        !scopes.has("https://www.googleapis.com/auth/spreadsheets") ||
        !Number.isFinite(Number(response.expires_in)) ||
        Number(response.expires_in) <= 60
      )
        throw new Error(
          "Cal autoritzar l’accés a Google Sheets per continuar.",
        );
      const expires = now() + (Number(response.expires_in) - 30) * 1000;
      const result = await fetchImpl(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${response.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!result.ok)
        throw new Error("No s’ha pogut verificar el compte de Google.");
      const user = await result.json();
      if (
        !allowedEmail ||
        user.email_verified !== true ||
        user.email?.toLowerCase() !== allowedEmail.toLowerCase()
      )
        throw new Error("Aquest compte no és l’autoritzat per a PANXA.");
      if (attempt !== generation)
        throw new Error("La connexió s’ha cancel·lat.");
      grant = { token: response.access_token, expires };
      return { email: user.email, name: user.name || "" };
    },
  };
}
