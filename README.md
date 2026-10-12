# fantasyfutbol

Plataforma online para seguir competiciones de fútbol: temporadas, calendarios, clasificaciones, partidos, equipos y jugadores, con las puntuaciones de cada jugador en cada partido según varios sistemas (picas de AS, SofaScore y su media).

Workspace con la misma operativa que [UTMA](../utma): frontend Angular (**ff-web**) + backend Laravel (**ff-api**), cada uno pensado como submódulo Git.

## Estado

| Parte | Estado |
|-------|--------|
| Modelo de datos | Definido y documentado |
| **ff-api** | Base Laravel 13 con Sail, migraciones, enums, modelos y seeders. Autenticación del admin por JWT. Panel: competiciones, temporadas (calendario, clasificación y equipos) y equipos. Sincronización con API-Football: calendario, equipos y clasificación de una liga, desde el panel o por consola. API pública de solo lectura para el sitio. Purga de la caché de páginas |
| **ff-web** | Angular 22 con `edas-ng` y `edas-layout`. **Parte pública** en español e inglés, generada en el servidor: portada, competiciones (resumen, clasificación, calendario por jornadas, equipos) y fichas de equipo, con SEO y datos estructurados. **Panel de gestión**: competiciones, temporadas, equipos, sincronización y caché de páginas |
| Producción | `fantasyfutbol.es`, en un VPS con aaPanel detrás de Cloudflare. Scripts de despliegue escritos; **primer despliegue pendiente** (ver [DEPLOY.md](DEPLOY.md)) |
| Git | `ff-web` es un repositorio local sin commits, con `edas-ng` y `edas-layout` ya como submódulos. `ff-api` y la raíz, sin inicializar. Los remotos se montan después |

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

Necesita Node 22.22.3 o superior y el backend levantado.

```bash
cd ff-web
git submodule update --init
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
