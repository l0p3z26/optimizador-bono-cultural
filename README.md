# Bono Cultural Videojuegos

App de una sola página que ayuda a optimizar el Bono Cultural Joven comprando
videojuegos físicos (FNAC, GAME o El Corte Inglés) y comparando precios de
recompra en CEX España, para maximizar el dinero recuperado.

- **Frontend**: HTML/JS vanilla, PWA instalable en iOS y Android, hosteado
  gratis en Cloudflare Pages con despliegue automático desde este repo de GitHub.
- **Backend**: Cloudflare Worker que actúa de proxy hacia la API de Gemini,
  ocultando las API keys y rotando entre 10 keys con failover automático.

Repo: https://github.com/l0p3z26/optimizador-bono-cultural

## Estructura

```
/frontend/
  index.html         La app
  manifest.json       Manifest PWA
  service-worker.js   Cache offline
  icons/
    icon-192.png
    icon-512.png

/worker/
  index.js            Proxy Cloudflare Worker
  wrangler.toml        Configuración del Worker
  setup-secrets.ps1   Script opcional para subir las 10 keys de una vez

API-key.txt            (local, NO se sube al repo — ver .gitignore)
```

---

## Paso 1 — Deploy del Worker

```bash
npm install -g wrangler
wrangler login
```

Desde la carpeta `/worker`:

```bash
wrangler kv:namespace create KEY_ROTATION
```

> Si tienes una versión reciente de wrangler y el comando anterior falla,
> usa la sintaxis nueva: `wrangler kv namespace create KEY_ROTATION`.

Copia el `id` que te devuelve el comando y pégalo en `worker/wrangler.toml`,
sustituyendo `PONER_ID_KV_AQUI`:

```toml
kv_namespaces = [
  { binding = "KEY_ROTATION", id = "TU_ID_AQUI" }
]
```

Añade las 10 API keys de Gemini como secrets (nunca se guardan en el repo,
solo viven en Cloudflare):

```bash
wrangler secret put GEMINI_KEY_1
wrangler secret put GEMINI_KEY_2
...
wrangler secret put GEMINI_KEY_10
```

Cada comando te pedirá pegar el valor de la key por consola.

Ya tienes un `API-key.txt` local con 10 keys de Gemini generadas. Para no
teclearlas una a una, puedes usar el script incluido (lee `API-key.txt`,
que está en `.gitignore` y nunca se sube a GitHub):

```powershell
cd worker
./setup-secrets.ps1
```

Por último, despliega el Worker:

```bash
wrangler deploy
```

Copia la URL que te da (algo como `https://bono-cultural-proxy.tuusuario.workers.dev`).

## Paso 2 — Configurar el frontend

En [frontend/index.html](frontend/index.html), busca:

```js
const WORKER_URL = "PONER_URL_DEL_WORKER";
```

y sustitúyelo por la URL real del Worker del paso anterior (sin barra final).

En [worker/index.js](worker/index.js), busca:

```js
const ALLOWED_ORIGIN = "https://PONER_PROYECTO.pages.dev";
```

y sustitúyelo por la URL real que te da Cloudflare Pages en el paso siguiente.
Vuelve a desplegar el Worker tras el cambio:

```bash
wrangler deploy
```

## Paso 3 — Deploy en Cloudflare Pages

El código ya está en GitHub: https://github.com/l0p3z26/optimizador-bono-cultural
Cloudflare Pages se conecta directamente a ese repo y lo redespliega solo en
cada push a `main` — no hace falta mover ni renombrar carpetas como con
GitHub Pages, se apunta directamente a `/frontend`.

1. Entra en el [dashboard de Cloudflare](https://dash.cloudflare.com) →
   **Workers & Pages → Create → Pages → Connect to Git**.
2. Autoriza la GitHub App de Cloudflare Pages y selecciona el repositorio
   `l0p3z26/optimizador-bono-cultural`.
3. Configuración de build:
   - **Framework preset**: None
   - **Build command**: (vacío — es HTML/JS estático, no hay build)
   - **Build output directory**: `frontend`
4. **Save and Deploy**.
5. Cloudflare te da una URL del tipo `https://optimizador-bono-cultural.pages.dev`.
   Cópiala y pégala como `ALLOWED_ORIGIN` en `worker/index.js` (paso anterior),
   luego `wrangler deploy` otra vez para que el Worker acepte peticiones desde
   esa URL.

A partir de aquí, cualquier `git push` a `main` redespliega la web sola.

## Paso 4 — Instalar como app

- **iOS**: Safari → botón compartir → "Añadir a pantalla de inicio"
- **Android**: Chrome → menú (⋮) → "Instalar aplicación"

---

## Notas

- El modo manual funciona sin conexión ni llamadas a la API: introduces los
  precios verificados tú mismo y la app calcula las combinaciones óptimas
  igualmente.
- El service worker cachea los assets estáticos (HTML, manifest, iconos) y
  usa network-first para las llamadas al Worker, con un mensaje de error
  claro si no hay conexión.
- Si las 10 keys de Gemini se agotan a la vez (rate limit o cuota), el
  Worker devuelve un error 502 y el frontend te sugiere el modo manual.
