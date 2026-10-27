export async function api(
  path,
  { method = "GET", body, signal, notify = true } = {},
) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "No es pot connectar amb PANXA. Comprova que el servidor estigui en marxa.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "El servidor no ha retornat una resposta vàlida. Executa npm run dev per iniciar PANXA.",
    );
  }
  if (!response.ok) {
    if (response.status === 428 && notify)
      window.dispatchEvent(new Event("panxa:sheets-required"));
    if (response.status === 401 && notify)
      window.dispatchEvent(new Event("panxa:unauthorized"));
    const error = new Error(
      data.error || "No s’ha pogut completar la petició.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
