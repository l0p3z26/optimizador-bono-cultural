# Bono Cultural Videojuegos

App de una sola página que ayuda a optimizar el Bono Cultural Joven comprando
videojuegos físicos (FNAC, GAME o El Corte Inglés) y comparando precios de
recompra en CEX España, para maximizar el dinero recuperado.

- **Frontend**: HTML/JS vanilla, PWA instalable en iOS y Android, en Cloudflare
  (Workers Static Assets) con despliegue automático desde este repo de GitHub.
- **Backend**: Cloudflare Worker que actúa de proxy hacia la API de Gemini,
  ocultando las API keys, rotando entre 10 keys con failover automático, y
  exigiendo verificación humana (Cloudflare Turnstile) antes de gastar cuota.

Repo: https://github.com/l0p3z26/optimizador-bono-cultural

## Estado actual (ya desplegado)

- Frontend: https://optimizador-bono-cultural.lopezmorante08.workers.dev
- Worker proxy: https://bono-cultural-proxy.lopezmorante08.workers.dev
- Modelo: `gemini-2.5-flash` — es el único modelo de Gemini con búsqueda web
  (`google_search`) gratuita sin tarjeta (500 peticiones/día). Los modelos
  3.x no tienen búsqueda gratuita bajo ningún concepto (requieren facturación).
  **Google tiene programada la retirada de `gemini-2.5-flash` para el
  16 de octubre de 2026** — habrá que migrar a su sucesor antes de esa fecha.

## Estructura

```
/frontend/
  index.html         La app
  manifest.json       Manifest PWA
  service-worker.js   Cache offline
  wrangler.toml        Config para desplegar /frontend como sitio estatico
  .assetsignore        Excluye wrangler.toml del propio sitio publicado
  icons/
    icon-192.png
    icon-512.png

/worker/
  index.js            Proxy Cloudflare Worker
  wrangler.toml        Configuración del Worker
  setup-secrets.ps1   Script opcional para subir las 10 keys de una vez

API-key.txt            (local, NO se sube al repo — ver .gitignore)
```

Secrets configurados en el Worker (Cloudflare → nunca en el repo):
`GEMINI_KEY_1` … `GEMINI_KEY_10`, `TURNSTILE_SECRET`.

---

## Cómo se desplegó (referencia para reproducirlo)

### Paso 1 — Worker proxy

```bash
npm install -g wrangler
wrangler login
```

Desde `/worker`:

```bash
wrangler kv namespace create KEY_ROTATION
```

Copia el `id` devuelto a `worker/wrangler.toml` (`kv_namespaces[0].id`).

Sube las 10 keys de Gemini como secrets (nunca se guardan en el repo):

```bash
wrangler secret put GEMINI_KEY_1
...
wrangler secret put GEMINI_KEY_10
```

O usa el script incluido, que lee `API-key.txt` (gitignored):

```powershell
cd worker
./setup-secrets.ps1
```

### Paso 2 — Turnstile (verificación humana)

1. Dashboard de Cloudflare → **Turnstile → Add widget**.
2. Modo: **Managed**. Dominio: el del frontend
   (`optimizador-bono-cultural.lopezmorante08.workers.dev`).
3. Copia el **Site Key** a `frontend/index.html` (`TURNSTILE_SITE_KEY`).
4. Copia el **Secret Key** como secret del Worker:
   ```bash
   wrangler secret put TURNSTILE_SECRET
   ```

### Paso 3 — Deploy del Worker

```bash
cd worker
wrangler deploy
```

Copia la URL resultante a `ALLOWED_ORIGIN` en `worker/index.js`, y a
`WORKER_URL` en `frontend/index.html`.

### Paso 4 — Deploy del frontend (Cloudflare Workers Builds, vía Git)

Cloudflare unificó Pages y Workers: conectar un repo desde
**Workers & Pages → Create → Connect to Git** ya no pide una "carpeta de
build" sino un **Build command** y un **Deploy command** (usan `wrangler`
por debajo, incluso para sitios estáticos, vía "Workers Static Assets").
Como es un monorepo (`/frontend` + `/worker`), hace falta apuntar la
carpeta correcta — para eso existe `frontend/wrangler.toml`.

1. Dashboard de Cloudflare → **Workers & Pages → Create → Connect to Git**
   → autoriza la GitHub App → selecciona `l0p3z26/optimizador-bono-cultural`.
2. Nombre de proyecto: `optimizador-bono-cultural` (debe coincidir con el
   `name` de `frontend/wrangler.toml`).
3. Configuración:
   - **Path** (en Advanced settings): `/frontend` — imprescindible, si no
     wrangler no encuentra `frontend/wrangler.toml`.
   - **Build command**: vacío.
   - **Deploy command**: `npx wrangler deploy` (por defecto).
   - **Non-production branch deploy command**: `npx wrangler versions upload`
     (por defecto, no tocar).
   - **API token**: "Create new token" (automático).
4. **Save and Deploy**.

A partir de aquí, cualquier `git push` a `main` redespliega la web sola.

## Instalar como app

- **iOS**: Safari → botón compartir → "Añadir a pantalla de inicio"
- **Android**: Chrome → menú (⋮) → "Instalar aplicación"

---

## Notas

- El modo manual funciona sin conexión ni llamadas a la API: introduces los
  precios verificados tú mismo y la app calcula las combinaciones óptimas
  igualmente. No requiere verificación de Turnstile (no llama a la API).
- El service worker cachea los assets estáticos (HTML, manifest, iconos) y
  usa network-first para las llamadas al Worker, con un mensaje de error
  claro si no hay conexión.
- Si las 10 keys de Gemini se agotan a la vez (rate limit o cuota), el
  Worker devuelve un error 502 y el frontend te sugiere el modo manual.
- Los botones que llaman a la IA (Analizar, Reintentar, Reanalizar) están
  desactivados hasta completar el widget de Turnstile. El token se consume
  y se resetea en cada intento — hay que resolver el desafío antes de cada
  llamada a la API, no solo la primera vez.
