# Worker `ff-assets` — img.fantasyfutbol.es

Sirve las imágenes (caras, escudos, logos, estadios, equipaciones, logos de canales de TV) del bucket **privado** de Google Cloud Storage `fantasyfutbol-assets` bajo `https://img.fantasyfutbol.es/`. Es la única puerta al bucket: ni el sitio ni nadie enlaza a `storage.googleapis.com`. Ver el comentario de cabecera de [src/worker.js](src/worker.js) para las rutas que admite y cómo cachea.

## Lo que hay montado

| Qué | Dónde |
|-----|-------|
| Proyecto de Google Cloud | `fantasyfutbol-513810` |
| Bucket | `fantasyfutbol-assets`, región `europe-southwest1` (Madrid), acceso uniforme, Public Access Prevention activa |
| Cuenta que **escribe** (ff-api, desde el VPS) | `ff-api-assets@fantasyfutbol-513810.iam.gserviceaccount.com`, `roles/storage.objectAdmin` solo sobre el bucket. Su clave JSON es `ff-api/service-account.json` (ignorada por git) |
| Cuenta que **lee** (este Worker) | `ff-assets-reader@fantasyfutbol-513810.iam.gserviceaccount.com`, `roles/storage.objectViewer` solo sobre el bucket. Su clave va en los secretos del Worker |
| Worker | `ff-assets` en la cuenta de Cloudflare de fantasyfutbol, sin URL `workers.dev` |
| Dominio | `img.fantasyfutbol.es`, Custom Domain del Worker (Cloudflare mantiene el registro DNS) |

## Desplegar

Necesita Node 22 y un token de API de Cloudflare con *Workers Scripts: Edit*, *Account Settings: Read*, *Workers Routes: Edit*, *DNS: Edit* y *Zone: Read* sobre la zona. En el equipo de desarrollo está en `~/.config/fantasyfutbol/cloudflare-token`.

```bash
cd infra/cloudflare/assets-worker
npm install
export CLOUDFLARE_API_TOKEN=$(cat ~/.config/fantasyfutbol/cloudflare-token)
npm run deploy
```

Los secretos solo hay que subirlos la primera vez o al rotar la clave de la cuenta de servicio:

```bash
npm run secrets -- ~/.config/fantasyfutbol/ff-assets-reader.json
```

## Comprobar

```bash
# Un objeto que existe: 200, image/png, Cache-Control inmutable; la segunda vez, CF-Cache-Status: HIT
curl -sI https://img.fantasyfutbol.es/t/1/0123456789abcdef.png
# Directo al bucket, sin credenciales: 403 siempre
curl -sI https://storage.googleapis.com/fantasyfutbol-assets/teams/1/0123456789abcdef.png
# Los logos de los canales de TV van bajo /tv/ (carpeta tv-channels del bucket)
curl -sI https://img.fantasyfutbol.es/tv/1/0123456789abcdef.png
# Ruta fuera del patrón: 404 sin llegar al bucket
curl -sI https://img.fantasyfutbol.es/teams/1/x.png
# Lo que está pasando en el Worker, en directo
npm run tail
```

## Rotar la clave de lectura

```bash
gcloud iam service-accounts keys create ~/.config/fantasyfutbol/ff-assets-reader.json \
  --iam-account=ff-assets-reader@fantasyfutbol-513810.iam.gserviceaccount.com --project fantasyfutbol-513810
npm run secrets
# Comprobar que sirve, y solo entonces borrar la clave anterior:
gcloud iam service-accounts keys list --iam-account=ff-assets-reader@fantasyfutbol-513810.iam.gserviceaccount.com --project fantasyfutbol-513810
gcloud iam service-accounts keys delete <KEY_ID> --iam-account=ff-assets-reader@fantasyfutbol-513810.iam.gserviceaccount.com --project fantasyfutbol-513810
```

La de escritura (`ff-api-assets`) se rota igual, sustituyendo `service-account.json` en el VPS, como describe DEPLOY.md.

## Caché

Las URLs son inmutables (llevan el hash del contenido), así que no hay purga: cuando ff-api sube una imagen nueva, cambia la URL. Un 404 se cachea un minuto, para que un objeto recién subido no quede «atascado» como inexistente. Los errores del bucket no se cachean.
