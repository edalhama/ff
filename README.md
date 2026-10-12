# fantasyfutbol

Plataforma online para seguir competiciones de fútbol: temporadas, calendarios, clasificaciones, partidos, equipos y jugadores, con las puntuaciones de cada jugador en cada partido según varios sistemas (picas de AS, SofaScore y su media).

Workspace con la misma operativa que [UTMA](../utma): frontend Angular (**ff-web**) + backend Laravel (**ff-api**), cada uno en su propio repositorio y los dos como submódulos de este (ver [Repositorios](#repositorios)).

## Estado

| Parte | Estado |
|-------|--------|
| Modelo de datos | Definido y documentado |
| **ff-api** | Base Laravel 13 con Sail, migraciones, enums, modelos y seeders. Autenticación del admin por JWT. Panel: competiciones, temporadas (calendario, clasificación y equipos) y equipos. Sincronización con API-Football: calendario, equipos y clasificación de una liga, desde el panel o por consola. API pública de solo lectura para el sitio. Purga de la caché de páginas |
| **ff-web** | Angular 22 con `edas-ng` y `edas-layout`. **Parte pública** en español e inglés, generada en el servidor: portada, competiciones (resumen, clasificación, calendario por jornadas, equipos) y fichas de equipo, con SEO y datos estructurados. **Panel de gestión**: competiciones, temporadas, equipos, sincronización y caché de páginas |
| Producción | `fantasyfutbol.es`, en un VPS con aaPanel detrás de Cloudflare. Scripts de despliegue escritos; **primer despliegue pendiente** (ver [DEPLOY.md](DEPLOY.md)) |
| Git | En GitHub: este repositorio (`ff`) con `ff-api` y `ff-web` como submódulos; `ff-web` lleva a su vez `edas-ng` y `edas-layout` |

## Repositorios

| Repositorio | Carpeta | Qué es |
|-------------|---------|--------|
| [`edalhama/ff`](https://github.com/edalhama/ff) | `.` | Este: la documentación común (README, DEPLOY) y la versión de cada parte |
| [`edalhama/ff-api`](https://github.com/edalhama/ff-api) | `ff-api/` | Backend (submódulo) |
| [`edalhama/ff-web`](https://github.com/edalhama/ff-web) | `ff-web/` | Frontend (submódulo) |
| [`edalhama/edas-ng`](https://github.com/edalhama/edas-ng) | `ff-web/projects/edas-ng/` | Componentes Angular compartidos con UTMA (submódulo de ff-web) |
| [`edalhama/edas-layout`](https://github.com/edalhama/edas-layout) | `ff-web/projects/edas-layout/` | Estilos compartidos con UTMA (submódulo de ff-web) |

Rama principal: `main` en todos salvo `edas-layout`, que usa `master`.

**Clonar todo de una vez:**

```bash
git clone --recurse-submodules git@github.com:edalhama/ff.git fantasyfutbol
```

Si ya estaba clonado sin los submódulos: `git submodule update --init --recursive`.

**Cómo se trabaja.** El código vive en los submódulos; el repositorio padre solo guarda **en qué commit está cada uno**. Un cambio se hace de dentro hacia fuera:

1. Commit y push en el repositorio que cambia (`ff-api`, `ff-web`, o `edas-ng` / `edas-layout`).
2. Si ha cambiado `edas-ng` o `edas-layout`: en `ff-web`, commit de la nueva versión del submódulo (`git add projects/edas-ng`).
3. En el padre, commit de la nueva versión de `ff-api` / `ff-web` (`git add ff-api ff-web`), junto con lo que cambie de su propia documentación.

Así el padre siempre señala una combinación de API y web que funciona junta. `git status` en el padre muestra `modified: ff-web (new commits)` cuando un hijo ha avanzado y falta el paso 3.

**`edas-ng` y `edas-layout` son de UTMA también.** Traer sus cambios a fantasyfutbol es una decisión: `git pull` dentro del submódulo, comprobar que ff-web compila y pasa sus tests, y entonces el paso 2. Lo mismo al revés: un cambio hecho aquí en ellos llega a UTMA cuando allí se actualice el submódulo.

Los submódulos de `ff-web` usan URL `https://` y los del padre `git@` (SSH). Si `git submodule update` pide usuario de GitHub, es por los `https://`: cambiar sus URL en `ff-web/.gitmodules` a `git@github.com:edalhama/…` (y `git submodule sync`) lo resuelve.

Los secretos no se versionan: `.env` de ff-api y del servidor de páginas, `service-account.json` y similares están en los `.gitignore`.

## Estructura

```
fantasyfutbol/
├── DEPLOY.md             # Producción: cómo está montado y cómo se despliega
├── ff-web/               # Frontend Angular 22
│   ├── src/app/          # Pantallas, componentes y servicios propios
│   ├── src/server.ts     # Servidor que genera las páginas públicas (Node)
│   └── projects/
│       ├── edas-ng/      # Componentes edas-* (submódulo anidado)
│       └── edas-layout/  # Estilos LESS (submódulo anidado)
└── ff-api/               # Backend Laravel 13
    ├── app/Models/       # Modelos por agregado, con sus enums
    ├── database/         # Migraciones y seeders
    └── docs/             # API.md, DATABASE.md, DEV.md, SYNC.md, PAGE-CACHE.md
```

## Primer arranque del backend

```bash
cd ff-api
cp .env.example .env
composer install
./vendor/bin/sail up -d
./vendor/bin/sail artisan key:generate
./vendor/bin/sail artisan jwt:secret
./vendor/bin/sail artisan migrate --seed
./vendor/bin/sail artisan admin:create
./vendor/bin/sail test
```

API en `http://localhost:8090/api/`. Los puertos son distintos de los de UTMA para poder levantar los dos proyectos a la vez. Ver [ff-api/docs/DEV.md](ff-api/docs/DEV.md).

## Primer arranque del frontend

Necesita Node 22.22.3 o superior y el backend levantado. Con el repositorio clonado con `--recurse-submodules`, `edas-ng` y `edas-layout` ya están.

```bash
cd ff-web
npm install
npm start
```

Sitio en `http://localhost:4203` y panel en `http://localhost:4203/admin`, con el administrador creado por `admin:create`. Ver [ff-web/README.md](ff-web/README.md).

## Alcance funcional

- **Parte pública:** solo lectura por ahora. Multiidioma (español e inglés) con URLs propias por idioma, SEO completo y datos estructurados de schema.org. Hoy: competiciones, clasificaciones, jornadas y equipos; faltan partidos, jugadores y puntuaciones.
- **Admin:** gestión de toda la información.
- **Sincronización:** la mayor parte de los datos llega de forma automática desde proveedores externos; lo editado a mano en el admin no se sobrescribe.
- **Más adelante:** inicio de sesión de usuarios y acciones reservadas a usuarios registrados.

## Documentación

| Tema | Ubicación |
|------|-----------|
| Modelo de datos | [ff-api/docs/DATABASE.md](ff-api/docs/DATABASE.md) |
| Backend | [ff-api/README.md](ff-api/README.md) |
| Frontend | [ff-web/README.md](ff-web/README.md) |
| Endpoints | [ff-api/docs/API.md](ff-api/docs/API.md) |
| Entorno local (Sail) | [ff-api/docs/DEV.md](ff-api/docs/DEV.md) |
| Sincronización con proveedores | [ff-api/docs/SYNC.md](ff-api/docs/SYNC.md) |
| Caché de las páginas públicas | [ff-api/docs/PAGE-CACHE.md](ff-api/docs/PAGE-CACHE.md) |
| Despliegue | [DEPLOY.md](DEPLOY.md) |
