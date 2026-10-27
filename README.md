# PANXA · El teu diari digestiu

Diari en català per registrar només els dies amb molèsties. React + Vite,
Google Identity Services i Google Sheets. Web estàtica preparada per a
**https://ocollp.github.io/panxa/**, independent de Money Tracker.

## Desenvolupament local

```sh
nvm use
npm ci
cp .env.example .env # només si encara no tens .env; no sobreescriguis el teu
npm run dev
```

Obre http://127.0.0.1:5173/panxa/.
Configura a `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_SPREADSHEET_ID` i `ALLOWED_EMAIL`.
L’identificador OAuth és públic: **mai introdueixis un client secret**.
El `.env` està exclòs de Git. La compilació només inclou aquests tres valors
públics, no la resta de variables del fitxer.

## Publicació a GitHub Pages, pas a pas

1. A `ocollp/panxa`, obre **Settings → Pages → Source → GitHub Actions**.
2. Obre **Settings → Secrets and variables → Actions → Variables**.
3. Amb **New repository variable**, crea aquestes tres variables copiant els
   valors del teu `.env` local (sense cometes):
   - `GOOGLE_CLIENT_ID`: identificador OAuth acabat en `.apps.googleusercontent.com`.
   - `GOOGLE_SPREADSHEET_ID`: només l’identificador que hi ha entre `/d/` i `/edit` a l’URL del full.
   - `ALLOWED_EMAIL`: el compte de Google que fas servir per al diari.
4. A Google Cloud, al mateix client OAuth de tipus Web, comprova que hi ha
   `https://ocollp.github.io` a **Orígenes autorizados de JavaScript**.
   No hi afegeixis `/panxa/`. Conserva els orígens de Money Tracker i localhost.
5. Activa **Google Sheets API** al projecte de Google Cloud. Si el consentiment
   està en mode de proves, afegeix el compte autoritzat als usuaris de prova.
6. Fes commit i push a `main`. A **Actions**, espera que **Deploy PANXA to GitHub Pages**
   acabi en verd. El workflow comprova les proves, compila i publica només `dist/`.
7. Obre https://ocollp.github.io/panxa/, prem **Entrar amb Google** i concedeix el permís de Sheets.
   Desa un dia i comprova que apareix a la pestanya **PANXA** del full.

No cal servidor, SQLite ni un ordinador encès per utilitzar la versió publicada.
Si canvies una variable de GitHub, torna a executar el workflow perquè el canvi
s’incorpori a la compilació. Si falta una variable, la compilació falla explícitament.

## Privacitat i sessió

El codi i la configuració de la web són públics. La comprovació del correu a la
interfície no és una barrera de seguretat: **Google protegeix les dades amb els
permisos del full**. Mantén-lo privat, amb accés restringit al teu compte, i no
el publiquis al web. L’identificador del full no concedeix accés per si sol.

Google concedeix permís de lectura/escriptura de fulls; PANXA només opera sobre
el fitxer configurat i la pestanya PANXA. No demana accés a Gmail.
El token es manté únicament en memòria: no es desa en cookies, localStorage,
sessionStorage ni Git. En recarregar o tornar a obrir la web cal prémer Entrar
amb Google. Quan caduca, es pot reconnectar conservant el formulari obert.
Tancar sessió esborra el token i les dades de la pantalla, però no tanca la sessió
general de Google ni revoca els permisos concedits a altres apps.

Money Tracker i PANXA comparteixen origen a GitHub Pages; les rutes no són una
frontera de seguretat del navegador. No es desen tokens en emmagatzematge compartit.
Cal confiar en el codi de totes les webs publicades en aquest origen.

## Dades, còpies i limitacions

Els registres existents al full es mantenen. El full no s’esborra ni se substitueix.
La pestanya PANXA es crea amb el primer desat si no existeix. Formats desconeguts
o dates duplicades generen un error abans d’escriure.

CRUD amb comprovació de conflictes, calendari, informe mensual, CSV per Excel,
PDF i còpies JSON amb importació. Dates a partir de l’1 d’octubre de 2026.
Els CSV descarregats són instantànies: cal tornar a exportar després de canviar dades.
Les estadístiques compten dies registrats; no infereixen absència de símptomes ni causalitat.

Requereix Internet. No hi ha guardat local silenciós quan Google falla.
Les escriptures es serialitzen dins la pestanya i, amb Web Locks, entre pestanyes
del mateix navegador. Google Sheets no proporciona aquí una transacció entre
lectura i escriptura: evita editar alhora des de dos dispositius o manualment al full.
Descarrega còpies periòdiques. Si un desat queda sense confirmar per un error de
xarxa, actualitza el diari abans de repetir-lo.

Les dades antigues exclusives de SQLite no s’envien a Pages: exporta-les amb la
versió anterior i importa la còpia JSON. Els registres ja traslladats a Sheets
apareixeran automàticament. Els fitxers `server/` es conserven per compatibilitat
amb l’arxiu local i les proves; no formen part de la web publicada.

## Verificació

```sh
npm test
npm run build
npm run preview -- --port 5173
```

La previsualització és a http://127.0.0.1:5173/panxa/ (atura abans el servidor dev).
Les proves de Google usen respostes simulades; la primera autorització i el desat
real al lloc publicat s’han de comprovar amb el compte propietari.
