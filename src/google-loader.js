let googleScript;
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client?hl=ca";
    script.async = true;
    script.defer = true;
    const timer = setTimeout(() => {
      script.remove();
      googleScript = null;
      reject(
        new Error(
          "Google triga a respondre. Comprova la connexió i torna-ho a provar.",
        ),
      );
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      googleScript = null;
      reject(new Error("No s’ha pogut carregar l’accés amb Google."));
    };
    document.head.appendChild(script);
  });
  return googleScript;
}
