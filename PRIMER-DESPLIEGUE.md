# Primer despliegue — paso a paso

Lista para poner fantasyfutbol.es en marcha por primera vez. Cada paso dice **dónde** se hace, **qué** hacer y **cómo comprobar** que ha salido bien. No pases al siguiente si la comprobación falla. Los despliegues posteriores son solo `node deploy.cjs` y `npm run deploy` ([DEPLOY.md](DEPLOY.md), apartado 3).

Dónde se hace cada cosa:

| Etiqueta | Qué es |
|----------|--------|
| 💻 **Mac** | Tu terminal, en `~/Projects/edas/fantasyfutbol` |
| 🔴 **root** | Terminal del VPS como root: aaPanel → **Terminal** (menú lateral), o `su -` desde una sesión SSH |
| 🟢 **deployer** | `ssh -p 1311 deployer@145.239.197.90` desde el Mac |
| 🅰️ **aaPanel** | El panel web de aaPanel |
| ☁️ **Cloudflare** | dash.cloudflare.com → zona `fantasyfutbol.es` |

Los nombres de menú de aaPanel son los de la versión en inglés; según la versión pueden cambiar un poco (*App Store* también aparece como *Software Store*, *Website* como *Site*).

Apunta en algún sitio seguro (gestor de contraseñas) los valores que irás generando: contraseña de la base de datos, `APP_KEY`, `JWT_SECRET`, el token de la caché de páginas y la ruta de Node.

---

## Fase 0 · Antes de empezar

### 0.1 💻 Todo subido a git

Los scripts despliegan lo que hay en tu copia de trabajo, no lo que hay en GitHub. Haz commit de lo pendiente para saber exactamente qué versión sale.

```bash
cd ~/Projects/edas/fantasyfutbol
git status && git -C ff-api status && git -C ff-web status
```

✅ Los tres sin cambios (o solo los que hayas decidido no subir todavía).

### 0.2 💻 Herramientas locales

```bash
node -v            # v22.22 o superior
rsync --version | head -1
ssh -p 1311 deployer@145.239.197.90 'echo ok-deployer'
```

✅ Versión de Node correcta, `rsync` responde, y el SSH escribe `ok-deployer` **sin pedir contraseña**. Si la pide, tu clave pública no está en el VPS: guía de UTMA, paso C.

### 0.3 💻 La app compila y pasa los tests

```bash
cd ff-api && ./vendor/bin/sail test && cd ..
cd ff-web && npm run build && cd ..
```

✅ Tests en verde y `Application bundle generation complete`.

---

## Fase 1 · El sitio en aaPanel y Cloudflare

El sitio ya está creado. Aquí solo se comprueba y se ajusta.

### 1.1 🅰️ Ver la configuración del sitio

**Website** → fila `fantasyfutbol.es` → **Conf** (o clic en el nombre). Comprueba:

- **Site directory** → *Site directory*: `/www/wwwroot/fantasyfutbol.es`. *Running directory*: `/` (sin cambiar).
- **PHP** (o *PHP version*): **PHP-85**. La API necesita PHP 8.4 o superior.
- **SSL**: el certificado instalado es el *Origin Certificate* de Cloudflare (igual que UTMA). Si no hay ninguno: ☁️ **SSL/TLS → Origin Server → Create Certificate**, y pega el certificado y la clave en 🅰️ **SSL → Other certificate** (o *Custom certificate*) → **Save**. Activa **Force HTTPS**.
- **URL rewrite**: vacío (las reglas van en el `.htaccess` que sube el despliegue).

### 1.2 🅰️ open_basedir: igual que UTMA

La API se servirá desde fuera de la raíz del sitio (por un enlace simbólico) y PHP tiene que poder leerla. Compáralo con UTMA, que ya funciona así:

```bash
# 🔴 root
cat /www/wwwroot/utma.es/.user.ini 2>/dev/null || echo "UTMA: sin .user.ini"
cat /www/wwwroot/fantasyfutbol.es/.user.ini 2>/dev/null || echo "FF: sin .user.ini"
```

Si UTMA no tiene `.user.ini` (o no tiene `open_basedir`) y fantasyfutbol sí: 🅰️ **Website → fantasyfutbol.es → Conf → Site directory** → desmarca **Anti-XSS attack** (*Anti-cross-site attack / open_basedir*) → guardar.

✅ Las dos salidas iguales en lo que a `open_basedir` se refiere.

### 1.3 🔴 Borrar la página de bienvenida

```bash
ls -la /www/wwwroot/fantasyfutbol.es/
rm -f /www/wwwroot/fantasyfutbol.es/index.html /www/wwwroot/fantasyfutbol.es/404.html
```

✅ En la carpeta solo quedan `.user.ini` (si lo hay) y, quizá, `.htaccess` y `.well-known`.

### 1.4 ☁️ Cloudflare básico

- **DNS → Records**: `fantasyfutbol.es` (A, a `145.239.197.90`) y `www` con la **nube naranja** (Proxied).
- **SSL/TLS → Overview**: **Full (strict)**.
- **Speed → Optimization → Content Optimization**: **Rocket Loader** desactivado (rompe el arranque de Angular sobre una página que ya llega pintada).
- **Caching → Configuration**: *Browser Cache TTL* en **Respect Existing Headers**.

✅ Comprobación desde el Mac:

```bash
curl -sI https://fantasyfutbol.es/ | grep -iE "^HTTP|^server"
```

Responde `server: cloudflare` (el código puede ser un 403/404/503 todavía: no hay nada desplegado).

---

## Fase 2 · Carpetas y permisos

### 2.1 🔴 Crear las carpetas y el enlace a la API

```bash
mkdir -p /www/wwwroot/fantasyfutbol.es_api /www/wwwroot/fantasyfutbol.es_web/server
chown -R deployer:www /www/wwwroot/fantasyfutbol.es /www/wwwroot/fantasyfutbol.es_api /www/wwwroot/fantasyfutbol.es_web
chmod 755 /www/wwwroot/fantasyfutbol.es /www/wwwroot/fantasyfutbol.es_api /www/wwwroot/fantasyfutbol.es_web

ln -s /www/wwwroot/fantasyfutbol.es_api/public /www/wwwroot/fantasyfutbol.es/backend
chown -h deployer:www /www/wwwroot/fantasyfutbol.es/backend
```

Si `chown` se queja de `.user.ini` (*Operation not permitted*), es normal: aaPanel lo deja inmutable. El resto queda bien.

✅ Comprobación:

```bash
ls -la /www/wwwroot/ | grep fantasyfutbol
ls -la /www/wwwroot/fantasyfutbol.es/backend
```

Tres carpetas de `deployer www`, y `backend -> /www/wwwroot/fantasyfutbol.es_api/public` (en rojo hasta el primer despliegue de la API: aún no existe `public`).

### 2.2 🟢 deployer puede escribir

```bash
id deployer                                          # debe incluir el grupo www
touch /www/wwwroot/fantasyfutbol.es_api/.prueba && rm /www/wwwroot/fantasyfutbol.es_api/.prueba && echo ok-api
touch /www/wwwroot/fantasyfutbol.es_web/.prueba && rm /www/wwwroot/fantasyfutbol.es_web/.prueba && echo ok-web
touch /www/wwwroot/fantasyfutbol.es/.prueba && rm /www/wwwroot/fantasyfutbol.es/.prueba && echo ok-sitio
```

✅ `ok-api`, `ok-web` y `ok-sitio`.

---

## Fase 3 · Redis

### 3.1 🔴 Redis responde

```bash
which redis-cli || ls /www/server/redis/src/redis-cli
redis-cli ping            # o: /www/server/redis/src/redis-cli ping
```

✅ `PONG`. Si dice `NOAUTH Authentication required`, Redis tiene contraseña:

```bash
grep -E "^(requirepass|port|bind)" /www/server/redis/redis.conf
redis-cli -a 'LA_CONTRASEÑA' ping
```

También se ve en 🅰️ **App Store → Redis → Setting → Performance tuning** (campo *requirepass*). Apunta puerto y contraseña.

### 3.2 🔴 Qué bases de datos de Redis usa UTMA

```bash
grep -E "^REDIS_|^CACHE_STORE|^CACHE_PREFIX" /www/wwwroot/utma.es_api/.env
redis-cli INFO keyspace            # añade -a 'LA_CONTRASEÑA' si la tiene
```

Lo normal: UTMA sin `REDIS_DB` / `REDIS_CACHE_DB` (usa la 0 y la 1) y `INFO keyspace` con `db0` y `db1`.

✅ Elige para fantasyfutbol **dos números que no aparezcan** en ninguna de las dos salidas. En el resto de esta guía: **2** y **3**.

### 3.3 🔴 PHP 8.5 tiene la extensión de Redis

```bash
/www/server/php/85/bin/php -m | grep -i redis
```

✅ Sale `redis`. Si no sale: 🅰️ **App Store → PHP-8.5 → Setting → Install extensions** → `redis` → **Install**. Después repite el comando.

---

## Fase 4 · Base de datos

### 4.1 🅰️ Crear la base de datos

**Databases → MySQL → Add DB**:

| Campo | Valor |
|-------|-------|
| DB name | `fantasyfutbol` |
| Username | `fantasyfutbol` |
| Password | genera una (botón de la derecha) y apúntala |
| Charset | `utf8mb4` |
| Access | **Local server** |

### 4.2 🔴 Comprobar el acceso

```bash
mysql -h 127.0.0.1 -u fantasyfutbol -p fantasyfutbol -e "SELECT VERSION(), @@character_set_database;"
```

✅ Pide la contraseña y responde con la versión de MySQL y `utf8mb4`.

---

## Fase 5 · Configuración de ff-api

### 5.1 🟢 Generar los secretos

En el VPS, con el PHP de aaPanel (no hace falta que la API esté instalada):

```bash
# APP_KEY
/www/server/php/85/bin/php -r 'echo "base64:".base64_encode(random_bytes(32)), PHP_EOL;'
# JWT_SECRET
/www/server/php/85/bin/php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
# Token compartido entre la API y el servidor de páginas (PAGE_CACHE_TOKEN = FF_CACHE_TOKEN)
openssl rand -hex 32
```

✅ Tres valores distintos. Apúntalos.

### 5.2 🟢 Crear el `.env` de la API

```bash
nano /www/wwwroot/fantasyfutbol.es_api/.env
```

Pega esto y rellena los `…` (los números de Redis, los del paso 3.2):

```ini
APP_NAME=fantasyfutbol
APP_ENV=production
APP_DEBUG=false
APP_KEY=…
APP_URL=https://fantasyfutbol.es/backend
APP_TIMEZONE=UTC
APP_LOCALE=es
APP_FALLBACK_LOCALE=es

LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=fantasyfutbol
DB_USERNAME=fantasyfutbol
DB_PASSWORD=…

SESSION_DRIVER=array
QUEUE_CONNECTION=sync

CACHE_STORE=redis
CACHE_PREFIX=ff
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=2
REDIS_CACHE_DB=3

URL_FRONTEND=https://fantasyfutbol.es
JWT_SECRET=…
API_FOOTBALL_KEY=…

PAGE_CACHE_URL=http://127.0.0.1:4000
PAGE_CACHE_TOKEN=…
SITE_DATA_CACHE=true
SITE_DATA_CACHE_TTL=600
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=
```

Si Redis tiene contraseña, `REDIS_PASSWORD=la-contraseña` en vez de `null`. Guarda con `Ctrl+O`, `Enter`, sal con `Ctrl+X`.

```bash
chgrp www /www/wwwroot/fantasyfutbol.es_api/.env
chmod 640 /www/wwwroot/fantasyfutbol.es_api/.env
```

✅ Comprobación (no muestra valores, solo que no falta ni sobra nada):

```bash
ls -la /www/wwwroot/fantasyfutbol.es_api/.env                                  # -rw-r----- deployer www
grep -c "=…" /www/wwwroot/fantasyfutbol.es_api/.env                            # 0: ninguno sin rellenar
grep -oE "^[A-Z_]+=" /www/wwwroot/fantasyfutbol.es_api/.env | sort | uniq -d   # vacío: ninguna clave repetida
```

---

## Fase 6 · Primer despliegue de la API

### 6.1 💻 Desplegar

```bash
cd ~/Projects/edas/fantasyfutbol/ff-api
node deploy.cjs
```

El script sube el código, instala dependencias, migra la base de datos y deja la configuración en caché. Tarda un par de minutos la primera vez (`composer install` descarga todo).

✅ Termina con `¡Despliegue de ff-api completado!`. Antes, la purga de caché muestra un error en la línea «Servidor de render»: es normal, el servidor de páginas aún no existe.

Si falla:
- **`rsync: delete_file: unlink(.user.ini) failed: Operation not permitted`** y el despliegue se detiene: la carpeta tiene un `.user.ini` de aaPanel (inmutable) y el script intentaba borrarlo. Corregido en `deploy.cjs` (lo excluye); vuelve a lanzarlo.
- **`composer` dice que `proc_open` o `putenv` están desactivadas**: 🅰️ **App Store → PHP-8.5 → Setting → Disabled functions** → quita esas dos de la lista. (Con UTMA desplegando en este mismo PHP no debería pasar.)
- **`SQLSTATE[HY000] [1045] Access denied`**: los `DB_*` del `.env` (fase 4).
- **`Class "Redis" not found`**: falta la extensión (paso 3.3).

### 6.2 🔴 Permisos de escritura de PHP

Las carpetas `storage` y `bootstrap/cache` no existían hasta ahora:

```bash
cd /www/wwwroot/fantasyfutbol.es_api
chmod -R 775 storage bootstrap/cache
find storage bootstrap/cache -type d -exec chmod g+s {} +
chown -R deployer:www storage bootstrap/cache
```

✅ `ls -la storage` muestra `drwxrwsr-x deployer www`.

### 6.3 🟢 Datos iniciales y tu usuario

```bash
cd /www/wwwroot/fantasyfutbol.es_api
/www/server/php/85/bin/php artisan db:seed --force
/www/server/php/85/bin/php artisan admin:create
```

`admin:create` pregunta nombre, email y contraseña.

✅ Comprobación:

```bash
/www/server/php/85/bin/php artisan about --only=environment,cache,drivers
/www/server/php/85/bin/php artisan migrate:status | tail -3
/www/server/php/85/bin/php artisan page-cache:status
```

- `about`: *Environment* `production`, *Debug Mode* `OFF`, *Cache* `redis`.
- `migrate:status`: todas `Ran`.
- `page-cache:status`: «Servidor de render: no responde» (normal por ahora), «Cloudflare: sin enlazar», **«Datos de la API: en caché (redis)»**.

### 6.4 💻 La API responde desde fuera

```bash
curl -s https://fantasyfutbol.es/backend/api/ping
curl -sI "https://fantasyfutbol.es/backend/api/site/competitions?lang=es" | grep -iE "^HTTP|x-ff-data-cache"
curl -sI "https://fantasyfutbol.es/backend/api/site/competitions?lang=es" | grep -iE "x-ff-data-cache"
```

✅ `{"success":true,"data":{"locale":"es"}}`; la segunda petición `HTTP/2 200` con `x-ff-data-cache: MISS`, la tercera con **`HIT`** (Redis funciona).

Si `/backend/api/ping` da un 404 o un 500:
- 🔴 `tail -n 50 /www/wwwroot/fantasyfutbol.es_api/storage/logs/laravel.log`
- 🔴 `tail -n 50 /www/wwwlogs/fantasyfutbol.es-error_log` (si menciona `open_basedir`, vuelve al paso 1.2).

### 6.5 🔴 Redis: lo de fantasyfutbol, en su sitio

```bash
redis-cli -n 3 --scan --pattern '*' | head -3      # con contraseña: redis-cli -a '…' -n 3 …
redis-cli INFO keyspace
```

✅ Claves con el prefijo `fantasyfutbol-database-ff` en la base de datos 3, y las de UTMA intactas en las suyas.

---

## Fase 7 · Servidor de páginas (Node)

### 7.1 🅰️ Instalar Node

**App Store** → busca **Node.js version manager** → *Install*. Ábrelo → instala la **24** (LTS).

🔴 Comprueba y apunta la ruta:

```bash
ls /www/server/nodejs/
/www/server/nodejs/v24*/bin/node -v
```

✅ `v24.x`. La ruta completa (por ejemplo `/www/server/nodejs/v24.11.0/bin/node`) es la que va en el paso 7.4.

### 7.2 🟢 El `.env` del servidor de páginas

```bash
nano /www/wwwroot/fantasyfutbol.es_web/.env
```

```ini
PORT=4000
HOST=127.0.0.1
FF_CACHE_TOKEN=…        # el mismo valor que PAGE_CACHE_TOKEN del .env de la API
```

```bash
chmod 600 /www/wwwroot/fantasyfutbol.es_web/.env
```

✅ Los dos tokens coinciden (compara sin mostrarlos):

```bash
diff <(grep ^PAGE_CACHE_TOKEN= /www/wwwroot/fantasyfutbol.es_api/.env | cut -d= -f2) \
     <(grep ^FF_CACHE_TOKEN= /www/wwwroot/fantasyfutbol.es_web/.env | cut -d= -f2) && echo "tokens iguales"
```

(Como deployer no puedes leer el `.env` de la API si su grupo es `www` y deployer no está en él; en ese caso hazlo como 🔴 root.)

### 7.3 🔴 El puerto 4000 está libre

```bash
ss -ltnp | grep ':4000 ' || echo "4000 libre"
```

✅ `4000 libre`. Si está ocupado, elige otro y cámbialo en los cuatro sitios que dice [DEPLOY.md](DEPLOY.md) (apartado 2.D).

### 7.4 💻 Primer despliegue de la web

```bash
cd ~/Projects/edas/fantasyfutbol/ff-web
npm run deploy
```

Compila, sube los ficheros públicos a la raíz del sitio y el servidor de páginas a `fantasyfutbol.es_web/server`.

✅ Termina con `¡Despliegue de ff-web completado!`. Antes avisa de que **el servidor de render no responde**: es lo esperado esta primera vez, aún no está dado de alta en Supervisor.

🔴 Comprueba que está todo en su sitio:

```bash
ls /www/wwwroot/fantasyfutbol.es/ | head          # index.csr.html, main-….js, assets…
ls -la /www/wwwroot/fantasyfutbol.es/.htaccess
ls /www/wwwroot/fantasyfutbol.es_web/server/       # server.mjs y más ficheros .mjs
```

### 7.5 🔴 Probar el servidor a mano

Antes de dejarlo en Supervisor, comprueba que arranca:

```bash
su - deployer -s /bin/bash -c 'cd /www/wwwroot/fantasyfutbol.es_web && /www/server/nodejs/v24.X.X/bin/node --env-file=.env server/server.mjs'
```

✅ Escribe `[server] ff-web en http://127.0.0.1:4000 · sitio https://fantasyfutbol.es/ · API https://fantasyfutbol.es/backend/api/ · caché activa`. Desde otra terminal 🔴:

```bash
curl -s http://127.0.0.1:4000/__ff/health
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://127.0.0.1:4000/
```

`{"ok":true,…}` y `200`. Para el proceso con `Ctrl+C`.

Si la portada da 503 y en la consola del proceso salen errores `[render]` con un 403, Cloudflare está bloqueando al servidor cuando pide datos a la API: ve al paso 9.3 y vuelve.

### 7.6 🅰️ Dejarlo en marcha con Supervisor

**App Store → Supervisor Manager** (instálalo si no está; UTMA ya lo usa) → **Add Daemon**:

| Campo | Valor |
|-------|-------|
| Name | `fantasyfutbol-web` |
| Run user | `deployer` |
| Run dir | `/www/wwwroot/fantasyfutbol.es_web` |
| Start command | `/www/server/nodejs/v24.X.X/bin/node --env-file=.env server/server.mjs` (tu ruta del 7.1) |
| Processes | `1` |

Guardar.

✅ En la lista, `fantasyfutbol-web` en estado **RUNNING**. Y 🔴:

```bash
curl -s http://127.0.0.1:4000/__ff/health
```

Si no arranca: Supervisor Manager → `fantasyfutbol-web` → **Log** (lo que escribe Node al arrancar).

### 7.7 🟢 El reinicio de los despliegues funciona

Los despliegues reinician el proceso tocando `restart.txt`; Supervisor tiene que volver a levantarlo:

```bash
curl -s http://127.0.0.1:4000/__ff/health ; echo
touch /www/wwwroot/fantasyfutbol.es_web/restart.txt
sleep 8
curl -s http://127.0.0.1:4000/__ff/health ; echo
```

✅ Las dos respuestas tienen `started_at` distinto: el proceso ha salido y Supervisor lo ha arrancado de nuevo. Si la segunda falla, en Supervisor Manager activa el reinicio automático del proceso (*autorestart*).

---

## Fase 8 · Comprobar la web

### 8.1 💻 Desde fuera

```bash
curl -sI https://fantasyfutbol.es/ | grep -iE "^HTTP|x-ff-cache|cache-control|server"
curl -sI https://fantasyfutbol.es/ | grep -i x-ff-cache
curl -s https://fantasyfutbol.es/ | grep -o "<title>[^<]*</title>"
curl -sI https://fantasyfutbol.es/admin | grep -iE "^HTTP"
curl -s https://fantasyfutbol.es/robots.txt
curl -s https://fantasyfutbol.es/sitemap.xml | head -5
curl -sI https://fantasyfutbol.es/__ff/health | head -1
```

✅
- Portada: `HTTP/2 200`, `x-ff-cache: MISS` la primera vez y **`HIT`** la segunda.
- Título: empieza por `Competiciones, calendarios y clasificaciones de fútbol |`.
- `/admin`: `200`.
- `robots.txt` con la línea `Sitemap:`; el sitemap empieza por `<?xml`.
- `/__ff/health` desde fuera: **404** (no se puede consultar desde internet).

### 8.2 💻 En el navegador

1. `https://fantasyfutbol.es/` → la portada (todavía sin competiciones).
2. `https://fantasyfutbol.es/admin` → acceso al panel; entra con el usuario del paso 6.3.
3. Panel → **Caché de páginas** → **Servidor de páginas: Activo** · **Cloudflare: Sin enlazar** · **Datos de la API: Activo**.

### 8.3 🔴 Que la caída del servidor de páginas no tumba el sitio

En Supervisor Manager, **Stop** `fantasyfutbol-web`. Abre `https://fantasyfutbol.es/` en el navegador: se tiene que ver igual (lo pinta el navegador). Desde el Mac, `curl -sI https://fantasyfutbol.es/ | head -1` da un `503` (eso es lo que verían los buscadores). **Start** otra vez.

✅ La página se ve con el proceso parado y vuelve a dar `200` al arrancarlo.

---

## Fase 9 · Datos y Cloudflare

### 9.1 💻 Primera competición

En el panel: **Competiciones → Nueva competición**: LaLiga, tipo *Liga*, país *España*. Fija el slug de las URLs si quieres uno concreto (p. ej. `laliga`).

🟢 Enlázala con API-Football:

```bash
cd /www/wwwroot/fantasyfutbol.es_api
/www/server/php/85/bin/php artisan sync:link laliga api-football 140
```

En el panel → la competición → **Sincronización** → año `2024` (el plan gratuito no da la temporada actual) → **Sincronizar ahora**.

✅ Comprobación:

```bash
/www/server/php/85/bin/php artisan sync:status laliga
/www/server/php/85/bin/php artisan page-cache:status
```

Partidos y clasificación cargados; en el registro de purgas del panel (Caché de páginas) aparece una «Tras una sincronización». Y en el navegador: `https://fantasyfutbol.es/laliga` y `https://fantasyfutbol.es/laliga/clasificacion`.

### 9.2 💻 Lo que ven los buscadores

```bash
curl -s https://fantasyfutbol.es/laliga/clasificacion | grep -oE '<link rel="(canonical|alternate)"[^>]*>|<title>[^<]*</title>'
curl -s https://fantasyfutbol.es/sitemap.xml | grep -c "<loc>"
```

✅ Título de la clasificación, la canónica y las alternativas en español e inglés; el sitemap ya con decenas de URLs.

Prueba también una página en la **[Prueba de resultados enriquecidos de Google](https://search.google.com/test/rich-results)**: `https://fantasyfutbol.es/laliga/calendario` debe detectar *Eventos* y *Ruta de navegación*.

### 9.3 ☁️ Si Cloudflare bloquea al propio servidor (solo si pasa)

Síntoma: las páginas salen con «No se han podido cargar los datos» o `curl -sI` da 503, y el log del proceso (Supervisor Manager → Log) tiene líneas `[render]` con un 403.

**Security → WAF → Custom rules → Create rule**: *Field* `IP Source Address` · *Operator* `equals` · *Value* `145.239.197.90` → *Action* **Skip** (marca todo lo que ofrezca saltar) → *Deploy*.

### 9.4 ☁️ Guardar las páginas también en Cloudflare (opcional)

Hasta aquí, cada visita llega al VPS y la sirve la caché del servidor de páginas. Si quieres que las sirva Cloudflare, haz **las dos cosas**:

1. **Regla de caché**: **Caching → Cache Rules → Create rule**:
   - *When incoming requests match*: *Custom filter expression* → `(http.host eq "fantasyfutbol.es" and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/backend"))`
   - *Cache eligibility*: **Eligible for cache**
   - *Edge TTL*: **Use cache-control header if present, bypass cache if not**
   - *Browser TTL*: **Respect origin TTL**
   - *Deploy*
2. **Token de purga**: perfil (arriba a la derecha) → **My Profile → API Tokens → Create Token → Create Custom Token**: permiso **Zone · Cache Purge · Purge**, *Zone Resources* `Include · Specific zone · fantasyfutbol.es` → crear y copiar. El **Zone ID** está en la portada de la zona (columna derecha, *API*).

🟢 Añádelos al `.env` de la API y recarga la configuración:

```bash
nano /www/wwwroot/fantasyfutbol.es_api/.env      # CLOUDFLARE_ZONE_ID=… y CLOUDFLARE_API_TOKEN=…
cd /www/wwwroot/fantasyfutbol.es_api && /www/server/php/85/bin/php artisan config:cache
/www/server/php/85/bin/php artisan page-cache:purge --all
```

✅ El último comando dice `Cloudflare: hecho.` Y desde el Mac, dos veces seguidas:

```bash
curl -sI https://fantasyfutbol.es/laliga | grep -iE "cf-cache-status|x-ff-cache"
```

La segunda vez, `cf-cache-status: HIT`. En el panel, Caché de páginas → **Cloudflare: Enlazado**.

---

## Al terminar

- 🔴 Repasa que nada quedó abierto de más: **Security → Firewall** en 🅰️ no debe tener abiertos el 4000 ni el 6379.
- 💻 Despliegues a partir de ahora: `cd ff-api && node deploy.cjs`, luego `cd ../ff-web && npm run deploy`. Siempre en ese orden, con todo en git.
- Si algo de esta guía no coincide con lo que ves en el VPS (rutas, nombres de menús), apúntalo: corregimos la guía para la próxima vez.
