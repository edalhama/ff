# Despliegue — fantasyfutbol

Cómo está montado **fantasyfutbol.es** en el VPS (aaPanel, Apache, detrás de Cloudflare) y cómo se despliega. Misma operativa que [UTMA](../utma/DEPLOY.md): un usuario `deployer` que sube por `rsync` y ejecuta lo necesario por SSH.

> **Primera vez**: sigue [PRIMER-DESPLIEGUE.md](PRIMER-DESPLIEGUE.md), la guía paso a paso con comandos y comprobaciones.

> **Sin probar en el servidor.** Los scripts y la configuración de este documento se han escrito a partir de la guía de UTMA y se han probado en local (el servidor de páginas, su caché, la purga y la API). Apache, Supervisor y Cloudflare no: el primer despliegue es también su prueba. Las comprobaciones de cada paso están al final.

## 1. Cómo queda montado

```
visitante ──► Cloudflare ──► Apache (fantasyfutbol.es)
                               │
                               ├─ /backend/…          ► ff-api (Laravel), por un enlace simbólico
                               │                          /api/site/… sale de Redis si lo tiene
                               ├─ ficheros que existen ► tal cual (JS, CSS, imágenes, robots.txt)
                               ├─ /admin…             ► index.csr.html: el panel se pinta en el navegador
                               └─ todo lo demás       ► servidor de páginas (Node, 127.0.0.1:4000)
                                                          genera la página (pidiendo los datos a la
                                                          API) o la saca de su caché
```

| Qué | Carpeta en el VPS |
|-----|-------------------|
| Raíz del sitio (lo que sirve Apache) | `/www/wwwroot/fantasyfutbol.es` |
| Servidor de páginas (Node) | `/www/wwwroot/fantasyfutbol.es_web` |
| ff-api (Laravel) | `/www/wwwroot/fantasyfutbol.es_api` |
| Enlace a la API | `/www/wwwroot/fantasyfutbol.es/backend` → `…_api/public` |

La API queda en `https://fantasyfutbol.es/backend/api/`.

**Por qué un proceso de Node.** Las páginas públicas (competiciones, clasificaciones, jornadas, equipos) tienen que llegar a los buscadores ya escritas, con sus datos, su título y sus datos estructurados. Las genera Angular en el servidor.

**Tres cachés.** Cloudflare (opcional) guarda páginas cerca del visitante; el servidor de páginas, en su memoria, las que ha generado; y la API, en Redis, sus respuestas, que usan tanto el servidor de páginas como el navegador al navegar por el sitio. Las tres se purgan juntas cuando cambian los datos. Ver [ff-api/docs/PAGE-CACHE.md](ff-api/docs/PAGE-CACHE.md).

**Si el proceso de Node se cae**, Apache entrega el esqueleto de la app y el navegador pinta la página pidiendo los datos a la API: las personas siguen viendo el sitio; los buscadores reciben un 503 y vuelven más tarde.

Conexión: la misma del VPS de UTMA (`145.239.197.90`, SSH en el puerto `1311`, usuario `deployer`). Si este sitio estuviera en otro servidor, los scripts admiten `DEPLOY_HOST`, `DEPLOY_PORT` y `DEPLOY_USER` como variables de entorno.

## 2. Preparar el VPS (una sola vez)

El sitio `fantasyfutbol.es` ya existe en aaPanel y `deployer` ya está creado (guía de UTMA, pasos A y C). Falta lo de este proyecto. Los comandos de este apartado, como `root`.

### A. Carpetas y permisos

```bash
mkdir -p /www/wwwroot/fantasyfutbol.es_api /www/wwwroot/fantasyfutbol.es_web/server
chown -R deployer:www /www/wwwroot/fantasyfutbol.es /www/wwwroot/fantasyfutbol.es_api /www/wwwroot/fantasyfutbol.es_web

# La API bajo /backend del propio dominio
ln -s /www/wwwroot/fantasyfutbol.es_api/public /www/wwwroot/fantasyfutbol.es/backend
chown -h deployer:www /www/wwwroot/fantasyfutbol.es/backend
```

aaPanel deja en la raíz del sitio un `index.html` y un `404.html` de bienvenida: bórralos (`index.html` taparía la portada).

### B. Redis

El VPS ya tiene Redis (lo usa UTMA). fantasyfutbol lo usa como caché de Laravel y, con ella, para guardar las respuestas de su API pública ([PAGE-CACHE.md](ff-api/docs/PAGE-CACHE.md)).

```bash
# ¿Responde? ¿Tiene contraseña? (en aaPanel: App Store → Redis → Setting)
redis-cli ping
grep -E "^(requirepass|port|bind)" /www/server/redis/redis.conf    # ruta habitual en aaPanel

# ¿Tiene el PHP de aaPanel la extensión? Si no sale `redis`: App Store → PHP 8.5 → Setting → Install extensions → redis
/www/server/php/85/bin/php -m | grep -i redis

# ¿Qué bases de datos de Redis usa ya UTMA? (dbN=… con claves)
redis-cli INFO keyspace        # con contraseña: redis-cli -a '…' INFO keyspace
```

**fantasyfutbol tiene que ir en bases de datos de Redis propias**, distintas de las de UTMA: un `cache:clear` vacía la base de datos entera, no solo lo de quien lo lanza. Laravel usa dos (`REDIS_DB` para lo general, `REDIS_CACHE_DB` para la caché; por defecto 0 y 1, que serán las de UTMA). Elige dos libres, p. ej. **2 y 3**, para el `.env` del paso C.

### C. Base de datos y `.env` de ff-api

Crea la base de datos y su usuario desde aaPanel → Databases.

Las dos claves de la aplicación se pueden generar en tu equipo, sin esperar al primer despliegue:

```bash
cd ff-api
./vendor/bin/sail artisan key:generate --show      # → APP_KEY
./vendor/bin/sail artisan jwt:secret --show         # → JWT_SECRET
openssl rand -hex 32                                # → PAGE_CACHE_TOKEN (y FF_CACHE_TOKEN del paso D)
```

Después, `/www/wwwroot/fantasyfutbol.es_api/.env`:

```ini
APP_NAME=fantasyfutbol
APP_ENV=production
APP_DEBUG=false
APP_URL=https://fantasyfutbol.es/backend
APP_KEY=base64:…
APP_LOCALE=es

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=…
DB_USERNAME=…
DB_PASSWORD=…

SESSION_DRIVER=array
QUEUE_CONNECTION=sync

# Redis (paso B): bases de datos propias, distintas de las de UTMA
CACHE_STORE=redis
CACHE_PREFIX=ff
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null           # o la de requirepass
REDIS_DB=2
REDIS_CACHE_DB=3

URL_FRONTEND=https://fantasyfutbol.es
JWT_SECRET=…
API_FOOTBALL_KEY=…

# Caché de páginas: el servidor de Node y el secreto que comparte con él (paso D)
PAGE_CACHE_URL=http://127.0.0.1:4000
PAGE_CACHE_TOKEN=…
# Respuestas de la API en Redis (por defecto activas, 10 minutos)
SITE_DATA_CACHE=true
SITE_DATA_CACHE_TTL=600
# Cloudflare (opcional, apartado 4)
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=
```

```bash
chown deployer:www /www/wwwroot/fantasyfutbol.es_api/.env
chmod 640 /www/wwwroot/fantasyfutbol.es_api/.env
```

No repitas ninguna clave dentro del fichero: Dotenv se queda con la última sin avisar. Y tras cualquier cambio en él: `php artisan config:cache` (el despliegue lo hace solo).

### D. Servidor de páginas (Node)

1. **Node 22.22 o superior** (vale 24). En aaPanel: App Store → *Node.js version manager*. Anota la ruta del binario (`which node`; con el gestor de aaPanel suele ser `/www/server/nodejs/<versión>/bin/node`).

2. **Su configuración**, en `/www/wwwroot/fantasyfutbol.es_web/.env`:

   ```ini
   PORT=4000
   HOST=127.0.0.1
   # El mismo valor que PAGE_CACHE_TOKEN en ff-api
   FF_CACHE_TOKEN=…
   ```

   ```bash
   chown deployer:www /www/wwwroot/fantasyfutbol.es_web/.env
   chmod 600 /www/wwwroot/fantasyfutbol.es_web/.env
   ```

   El resto de variables (topes de la caché, URL de la API) están descritas al principio de `ff-web/src/server.ts`; con los valores por defecto basta.

3. **El proceso**, en aaPanel → App Store → *Supervisor Manager* → nuevo proceso:

   | Campo | Valor |
   |-------|-------|
   | Nombre | `fantasyfutbol-web` |
   | Usuario | `deployer` |
   | Directorio | `/www/wwwroot/fantasyfutbol.es_web` |
   | Comando | `/ruta/a/node --env-file=.env server/server.mjs` |
   | Procesos | `1` |

   Un solo proceso: la caché vive en su memoria y dos procesos tendrían cada uno la suya. Hasta el primer despliegue de ff-web no hay nada que arrancar: si Supervisor lo da por fallido, se arranca a mano después (apartado 3, «El primer despliegue»).

4. **Apache como proxy.** El `.htaccess` del sitio (viene en el despliegue de ff-web) le pasa al proceso lo que le toca con `RewriteRule … [P]`. Necesita `mod_proxy` y `mod_proxy_http`, que en este VPS ya están activos (los usa el WebSocket de UTMA). El puerto 4000 **no** se abre en el cortafuegos: solo lo usa Apache desde dentro.

   Si el 4000 estuviera ocupado (`ss -ltnp | grep :4000`), cámbialo en cuatro sitios: `PORT` de este `.env`, `PAGE_CACHE_URL` del `.env` de ff-api, la regla del proxy en `ff-web/src/.htaccess` y `renderUrl` en `ff-web/deploy.js`.

## 3. Desplegar

Desde tu equipo, con tu clave SSH autorizada para `deployer` (`ssh -p 1311 deployer@145.239.197.90 true` tiene que entrar sin pedir nada). Siempre **primero la API y después la web**: la web nueva puede pedir datos que la API antigua no da.

```bash
cd ff-api && node deploy.cjs
cd ../ff-web && npm run deploy
```

**`ff-api/deploy.cjs`** sincroniza el código (sin `.env`, `vendor`, `tests` ni lo que hay en `storage`), y en el servidor ejecuta `composer install --no-dev`, `migrate --force`, `config:cache`, `route:cache` y purga la caché.

**`ff-web/deploy.js`** (`npm run deploy`):

1. Sube el número de versión (`version.txt` → `src/assets/version.json`).
2. Compila para producción.
3. Sube los ficheros públicos **sin borrar los anteriores**.
4. Sube el servidor de páginas y lo reinicia: toca `restart.txt`, el proceso lo ve y sale, y Supervisor lo arranca con el código nuevo y la caché vacía. Espera a que responda.
5. Purga la caché (Redis, servidor de páginas y Cloudflare si está enlazado).
6. Borra los ficheros de la versión anterior.

Ese orden evita que haya un momento con páginas rotas: mientras se reinicia, el HTML en circulación todavía pide los JS y CSS antiguos. Ninguno de los dos scripts hace commit ni toca git: despliegan lo que haya en tu copia de trabajo.

### El primer despliegue

Con el apartado 2 hecho:

1. **API.** `cd ff-api && node deploy.cjs`. Después, como `root`, los permisos de escritura de PHP (las carpetas no existían hasta ahora):

   ```bash
   chmod -R 775 /www/wwwroot/fantasyfutbol.es_api/storage /www/wwwroot/fantasyfutbol.es_api/bootstrap/cache
   find /www/wwwroot/fantasyfutbol.es_api/storage /www/wwwroot/fantasyfutbol.es_api/bootstrap/cache -type d -exec chmod g+s {} +
   ```

   Y una sola vez, como `deployer`:

   ```bash
   cd /www/wwwroot/fantasyfutbol.es_api
   /www/server/php/85/bin/php artisan db:seed --force     # países, proveedores, sistemas de puntuación
   /www/server/php/85/bin/php artisan admin:create        # tu usuario del panel
   ```

   Comprobación: `curl -s https://fantasyfutbol.es/backend/api/ping` → `{"success":true,…}`.

2. **Web.** `cd ff-web && npm run deploy`. Si al final avisa de que el servidor de páginas no responde, arranca (o reinicia) `fantasyfutbol-web` en Supervisor Manager: hasta ahora no tenía qué arrancar.

   Comprobación: `https://fantasyfutbol.es/` enseña la portada, y `https://fantasyfutbol.es/admin` el acceso al panel.

3. **Datos.** En el panel, crea LaLiga (el slug de la URL sale del nombre; puedes fijarlo, p. ej. `laliga`). Enlázala con API-Football, por SSH:

   ```bash
   cd /www/wwwroot/fantasyfutbol.es_api
   /www/server/php/85/bin/php artisan sync:link laliga api-football 140
   ```

   Y sincroniza desde la pestaña Sincronización de la competición. Con el plan gratuito, indica una temporada antigua (2024); la actual pide el plan Pro.

4. **Comprobaciones** del apartado 5.

## 4. Cloudflare

Lo mismo que en UTMA para lo básico: registro con proxy (nube naranja), SSL/TLS en **Full (strict)** y en el sitio de aaPanel un **Origin Certificate** de Cloudflare.

Lo propio de este sitio:

- **Rocket Loader, desactivado.** Reordena la carga del JavaScript y rompe el arranque de Angular sobre una página que ya llega pintada.

- **El servidor de páginas llama a la API por la URL pública**, o sea, pasando por Cloudflare. Si Cloudflare tomara esas peticiones por un bot (en el log del proceso se verían respuestas 403 y las páginas saldrían con un 503), añade en Security → WAF una regla que deje pasar la IP del propio VPS.

- **Guardar las páginas en Cloudflare es opcional.** Por defecto Cloudflare no guarda HTML y todas las visitas llegan al VPS, donde las atiende la caché del servidor de páginas: para empezar es suficiente. Para que las sirva Cloudflare sin llegar al VPS:

  1. Caching → Cache Rules → nueva regla. *Si* el nombre de host es `fantasyfutbol.es` y la ruta no empieza por `/admin` ni por `/backend` → **Eligible for cache**, con *Edge TTL: Use cache-control header if present, bypass cache if not* y *Browser TTL: Respect origin*.
  2. Un token de API con el permiso *Zone → Cache Purge → Purge* para esta zona, y el *Zone ID* (está en la portada de la zona). Los dos, al `.env` de ff-api (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`) y `php artisan config:cache`.

  **Las dos cosas van juntas.** Con la regla y sin el token, Cloudflare seguiría enseñando una clasificación antigua hasta que le caducase. El panel (Caché de páginas) dice si Cloudflare está enlazado.

  Cada página sale con `Cache-Control: s-maxage=…` (cuánto puede guardarla Cloudflare) y `Cache-Tag` (de qué datos depende); la purga usa esas etiquetas.

- La IP real del visitante la saca Laravel de `X-Forwarded-For` porque confía en los rangos de Cloudflare (`ff-api/config/trustedproxy.php`).

## 5. Comprobar y diagnosticar

```bash
# ¿Responde el servidor de páginas? (desde el VPS)
curl -s http://127.0.0.1:4000/__ff/health

# ¿Qué hay en la caché? ¿Están enlazadas las capas?
cd /www/wwwroot/fantasyfutbol.es_api && /www/server/php/85/bin/php artisan page-cache:status

# Desde fuera: X-FF-Cache dice de dónde ha salido la página (MISS la primera vez, HIT después);
# cf-cache-status, si la ha servido Cloudflare
curl -sI https://fantasyfutbol.es/ | grep -iE "^HTTP|x-ff-cache|cf-cache-status|cache-control"

# ¿La API? ¿Y su caché en Redis? (X-FF-Data-Cache: MISS la primera vez, HIT después)
curl -s https://fantasyfutbol.es/backend/api/ping
curl -sI "https://fantasyfutbol.es/backend/api/site/competitions?lang=es" | grep -i x-ff-data-cache

# ¿El sitemap?
curl -s https://fantasyfutbol.es/sitemap.xml | head
```

| Síntoma | Dónde mirar |
|---------|-------------|
| La portada es la de aaPanel | Queda su `index.html` en la raíz del sitio |
| Las páginas se ven, pero `curl -sI` da 503 | El proceso de Node no está en marcha: Supervisor Manager → `fantasyfutbol-web` → log |
| Páginas con «No se han podido cargar los datos» | El servidor de páginas no llega a la API: su log (líneas `[render]`), y el punto de Cloudflare de arriba |
| El panel dice «No responde» en el servidor de páginas | `PAGE_CACHE_URL` / `PAGE_CACHE_TOKEN` de ff-api no coinciden con `PORT` / `FF_CACHE_TOKEN` del proceso, o falta `config:cache` |
| Error 500 en `/backend/api/…` | `storage/logs/laravel.log` de ff-api; permisos de `storage` (primer despliegue, punto 1) |
| `Class "Redis" not found` o `Connection refused [tcp://127.0.0.1:6379]` en el log | Falta la extensión `redis` en el PHP 8.5 de aaPanel, o `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` no son los de Redis (paso B) |
| Las respuestas de `/api/site` nunca dicen `HIT` | `CACHE_STORE` no es `redis`, o falta `config:cache` tras cambiar el `.env`. `page-cache:status` lo dice |
| `/backend/api/…` responde 404 de Apache | El enlace simbólico `backend`, o *open_basedir* activo en el sitio (aaPanel → sitio → Site directory) impidiendo salir de la raíz |
| Tras desplegar, el sitio sigue con lo anterior | Cloudflare guarda HTML y no está enlazado para purgar (punto 4) |

Logs, como `deployer`:

```bash
ssh -p 1311 deployer@145.239.197.90 'tail -n 100 /www/wwwroot/fantasyfutbol.es_api/storage/logs/laravel.log'
ssh -p 1311 deployer@145.239.197.90 'tail -n 100 /www/wwwlogs/fantasyfutbol.es-error_log'
```

El del servidor de páginas lo guarda Supervisor (Supervisor Manager → Log).

## 6. Pendiente

- **Sincronización programada.** Cuando se decida su frecuencia, hará falta el cron del scheduler de Laravel, igual que en UTMA (aaPanel → Cron, como `deployer`, cada minuto). Con Redis como caché, los bloqueos del scheduler (`withoutOverlapping`) ya tendrán dónde guardarse.
- **Política de seguridad de contenido (CSP).** El `.htaccess` pone las demás cabeceras de seguridad; la CSP queda para cuando el sitio esté estable, porque las páginas generadas en el servidor llevan scripts en línea que habría que autorizar uno a uno.
