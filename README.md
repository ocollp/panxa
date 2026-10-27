# PANXA · El teu diari digestiu

Diari digestiu en català amb accés privat de Google. React + Vite, API Fastify, sessions locals i registres a Google Sheets. La identitat es verifica amb Google; no es demana accés a Gmail, Drive ni Sheets.

## Arrencar

Cal Node.js 22.13 o superior i npm.

```sh
npm install
npm run dev
```

Obre **http://127.0.0.1:5173**. La comanda inicia web i API (port 3002); Ctrl+C les atura. Cal reiniciar-la després de canviar `.env`. No iniciïs només Vite: les dades necessiten l’API.

La configuració local d’aquest ordinador ja és a `.env`, exclòs de Git. S’ha reutilitzat únicament l’identificador públic OAuth de Money Tracker i s’ha configurat el compte que has autoritzat. Money Tracker no s’ha modificat.

En un altre entorn, copia `.env.example` a `.env` i configura:

- `GOOGLE_CLIENT_ID`: client OAuth de tipus **Aplicació web** de Google.
- `ALLOWED_EMAIL`: l’únic correu que podrà iniciar sessió; no és una variable VITE.
- `APP_ORIGIN`: origen exacte de la web, sense barra final. En local: `http://127.0.0.1:5173`.
- `API_PORT`: 3002 per defecte.
- `DATABASE_PATH`: sessions i arxiu de registres anteriors; per defecte `./data/panxa.sqlite`.
- `GOOGLE_SPREADSHEET_ID`: identificador del full privat. El full facilitat ja està configurat a `.env`.

No cal cap client secret per a aquest flux d’identitat. Si falta configuració, l’accés queda tancat.

## Si Google bloqueja l’entrada

Al projecte del client OAuth, obre Google Cloud Console → Google Auth Platform → Clients i selecciona el client web. A **Authorized JavaScript origins**, comprova que hi hagi exactament `http://127.0.0.1:5173`. Si fas servir `localhost`, caldrà autoritzar aquest origen i ajustar `APP_ORIGIN` també. No s’han modificat els orígens de Google Cloud automàticament.

Si l’aplicació OAuth està en mode de prova, afegeix el teu compte als usuaris de prova. El nom de consentiment pot continuar sent el de Money Tracker mentre es reutilitzi aquell client. Per tenir una identitat PANXA separada, crea un client OAuth propi i canvia `GOOGLE_CLIENT_ID`.

Torna a carregar PANXA i prem el botó de Google. L’entrada real s’ha de completar amb el teu compte. Les proves automatitzades no substitueixen aquesta comprovació del client OAuth i dels seus orígens.

## Dades i privacitat

- L’API comprova la signatura, l’audiència, l’emissor i la caducitat del token amb `google-auth-library`, i valida el correu verificat autoritzat i un nonce d’un sol ús.
- Les sessions duren 12 hores, es guarden al servidor amb el token resumit criptogràficament i s’envien en una galeta HttpOnly i SameSite=Strict; en producció, també Secure. El tancament de sessió revoca la sessió al servidor.
- Cada operació consulta només dades del `sub` de Google verificat. El client no pot triar el propietari d’una petició. Les escriptures exigeixen l’origen configurat i JSON.
- Els registres nous es desen al full de Google Sheets configurat, no a SQLite ni a IndexedDB. El servidor els envia a Google amb la teva autorització. Els tokens de Sheets es mantenen només en memòria fins que caduquen, tanques sessió o es reinicia el servidor; mai a localStorage ni al disc.
- En local, el servidor és aquest ordinador. Per accedir-hi des de diversos dispositius cal desplegar el mateix servidor amb HTTPS i disc persistent; això encara no s’ha fet.
- L’accés de Google protegeix l’API. Mantén el full amb accés general restringit i sense compartir-lo amb altres persones si només tu has de veure les dades. Qui tingui accés administratiu al servidor pot llegir l’arxiu SQLite anterior. Les exportacions són fitxers llegibles; desa-les en un lloc privat.

### Recuperar els registres anteriors

Després d’entrar, PANXA detecta els registres IndexedDB del mateix navegador i origen. Prem **Traslladar al meu compte**. Només es retiren del navegador els registres que Google Sheets confirma que ha desat o que ja són idèntics. Si hi ha registres de l’anterior servidor SQLite, apareix un segon avís per traslladar-los; l’arxiu SQLite es conserva com a còpia anterior. Els conflictes es mantenen localment i es poden descarregar. La migració no és automàtica. Les dades anteriors continuen sent dades locals accessibles al perfil del navegador fins que les traslladis; la nova sessió no les xifra retroactivament.

Les còpies JSON anteriors continuen sent compatibles. La importació afegeix dates noves, sense sobreescriure les existents. El diari admet dates des de l’1 d’octubre de 2026 fins avui.

### Còpies de seguretat

Continua descarregant JSON des de l’aplicació. Per copiar SQLite directament, atura el servidor abans de copiar `data/panxa.sqlite`; si el copies en calent, també necessites una còpia coherent dels fitxers WAL. No pugis `data/` ni `.env` al repositori.

## Producció

```sh
npm run build
npm start
```

Configura `APP_ORIGIN=https://el-teu-domini`, les variables OAuth i un `DATABASE_PATH` en un disc persistent. L’API serveix `dist/` i les rutes `/api` en el mateix origen; posa un proxy HTTPS al davant. El procés s’escolta a 127.0.0.1 per defecte; `HOST` permet adaptar-lo a un contenidor. Producció es nega a arrencar sense Google, correu autoritzat o origen HTTPS. No és un desplegament estàtic de GitHub Pages.

## Verificació i codi

`npm test` comprova validació, compatibilitat, CSV/PDF, emmagatzematge local anterior i API: sessions, credencials falses, correus aliens, CSRF, aïllament, importació atòmica, conflictes, caducitat i persistència després de reiniciar. `npm run build` comprova la compilació.

- `src/auth.jsx`: entrada amb Google i límit de sessió de la interfície.
- `src/api.js`, `src/storage.js`: accés autenticat a l’API.
- `src/LegacyImport.jsx`, `src/legacy-storage.js`: recuperació del diari local anterior.
- `server/app.js`: autenticació i rutes protegides.
- `server/store.js`: sessions i registres SQLite.
- `src/domain.js`, `src/export.js`: validació i informes.

La connexió real amb el full queda pendent de concedir el permís de Google Sheets amb el compte de la propietària. No hi ha cap mode de simulació d’accés disponible a la web; els verificadors simulats només s’injecten en les proves.

Referència: [verificació de tokens de Google al servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Connectar el full de Google Sheets

Configura a `.env` la variable `GOOGLE_SPREADSHEET_ID` amb l’identificador del teu full. Per exemple, en un enllaç `https://docs.google.com/spreadsheets/d/IDENTIFICADOR/edit`, copia només `IDENTIFICADOR`. Mantén el full privat.

1. Inicia PANXA i entra amb el compte autoritzat.
2. Prem **Connectar Google Sheets** i autoritza el mateix compte. El permís OAuth de fulls de càlcul és ampli; PANXA limita les peticions al fitxer configurat al servidor. No es demanen permisos de Gmail.
3. Si Google indica que l’API no està habilitada, activa **Google Sheets API** al projecte del client OAuth. Si està en mode de prova, mantén el compte com a usuari de prova.
4. Desa un dia i comprova’l a la pestanya **PANXA**. Es crea en el primer desat, sense modificar les altres pestanyes. No s’ha escrit al full des d’aquesta sessió de desenvolupament.

La pestanya té sis columnes: Data, Què vaig menjar, Símptomes, Intensitat (0-10), Temps fins als símptomes i Notes. Si ja hi ha una pestanya PANXA amb capçaleres desconegudes o registres invàlids, l’aplicació s’atura sense sobreescriure-la. El CSV mensual continua disponible; Sheets és la font principal de dades, no un CSV sincronitzat.

Les peticions de desat se serialitzen en una única instància de servidor i cada canvi es fa amb un batchUpdate atòmic. Es comprova que el registre no hagi canviat abans d’editar-lo. Google Sheets no ofereix un bloqueig transaccional que cobreixi lectura i escriptura: evita editar la pestanya manualment mentre fas servir PANXA i executa una sola instància de l’API. No es reintenten automàticament escriptures amb resultat incert: actualitza el diari abans de reintentar-les.

Cal tornar a connectar Sheets quan caduca el permís o es reinicia el servidor. L’app manté el formulari obert en el cas de caducitat del permís de Sheets, però recarregar la pàgina perd el text encara no desat. Desar requereix connexió a Internet; no hi ha un desat local alternatiu silenciós.

Encara cal desplegar l’API per accedir a PANXA des de fora d’aquest ordinador. Desar les dades a Drive no converteix aquesta versió en una web estàtica de GitHub Pages.
