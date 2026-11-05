/**
 * Worker de Cloudflare para `img.fantasyfutbol.es`: sirve las imágenes (caras, escudos, logos,
 * estadios, equipaciones) del bucket PRIVADO de Google Cloud Storage `fantasyfutbol-assets`.
 *
 * Por qué existe:
 *   - El bucket no es público (Public Access Prevention activa). El único que lo lee es este
 *     Worker, con la cuenta de servicio `ff-assets-reader` (solo `storage.objectViewer`). Nadie
 *     puede pedir las imágenes a `storage.googleapis.com` ni saber cómo se llama el bucket.
 *   - Las URLs públicas son opacas: `/t/{id}/{hash}.png`. El hash es del contenido, así que la
 *     URL cambia cuando cambia la imagen y nunca hay que purgar: se cachea un año, inmutable,
 *     en el borde de Cloudflare y en el navegador.
 *   - El tráfico lo absorbe Cloudflare: la caché se maneja con la Cache API, con clave la URL
 *     pública, y solo se va al bucket cuando no está.
 *
 * Qué rutas admite (todo lo demás es 404 sin tocar el bucket):
 *   /t/{id}/{hash}.{ext}  → teams/{id}/{hash}.{ext}          escudos y equipaciones
 *   /p/{id}/{hash}.{ext}  → players/{id}/{hash}.{ext}        caras
 *   /c/{id}/{hash}.{ext}  → competitions/{id}/{hash}.{ext}   logos de competición
 *   /v/{id}/{hash}.{ext}  → venues/{id}/{hash}.{ext}         fotos de estadio
 *   El hash son 16 hex (SHA-256 del fichero, recortado), con un sufijo opcional `-xx` para
 *   variantes (tamaños) que ff-api pueda generar más adelante.
 *
 * Configuración (wrangler.toml y secretos):
 *   GCS_BUCKET         nombre del bucket (var)
 *   GCS_CLIENT_EMAIL   email de la cuenta de servicio (secreto)
 *   GCS_PRIVATE_KEY    su clave privada PEM, del JSON de la clave (secreto)
 */

/** Prefijo público (una letra) → carpeta del bucket. */
const FOLDERS = { t: 'teams', p: 'players', c: 'competitions', v: 'venues' };

/** Ruta pública válida: prefijo, id numérico, hash de 16 hex con variante opcional, extensión. */
const PATH = /^\/([tpcv])\/(\d{1,12})\/([0-9a-f]{16}(?:-[a-z0-9]{1,8})?)\.(png|jpg|jpeg|webp|avif|gif|svg)$/;

const CACHE_CONTROL = {
  ok: 'public, max-age=31536000, immutable',
  notFound: 'public, max-age=60',
  error: 'no-store',
};

/** Cabeceras del origen que se dejan pasar al cliente. El resto (x-goog-*, etc.) se descartan. */
const KEPT_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified'];

const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Token OAuth vigente, compartido por todas las peticiones del mismo isolate. */
let accessToken = null; // { value, expiresAt (ms) }
let signingKey = null; // CryptoKey, importada una vez

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const url = new URL(request.url);
    const match = PATH.exec(url.pathname);

    if (!match) {
      return plain(404, 'Not Found', CACHE_CONTROL.notFound);
    }

    // Clave de caché: la URL pública sin query (no significa nada aquí) y siempre como GET.
    url.search = '';
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cache = caches.default;

    let response = await cache.match(cacheKey);

    if (!response) {
      response = await fromBucket(env, `${FOLDERS[match[1]]}/${match[2]}/${match[3]}.${match[4]}`);

      if (response.status === 200 || response.status === 404) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return request.method === 'HEAD' ? new Response(null, response) : response;
  },
};

/** Pide el objeto al bucket con la cuenta de servicio y construye la respuesta pública. */
async function fromBucket(env, objectPath) {
  let token;

  try {
    token = await getAccessToken(env);
  } catch (error) {
    console.error('No se ha podido obtener el token de GCS:', error);

    return plain(502, 'Bad Gateway', CACHE_CONTROL.error);
  }

  const origin = await fetch(`https://storage.googleapis.com/${env.GCS_BUCKET}/${objectPath}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Que Cloudflare no cachee por su cuenta la petición al origen: la caché es la nuestra,
    // con clave la URL pública.
    cf: { cacheTtl: 0 },
  });

  if (origin.status === 404) {
    return plain(404, 'Not Found', CACHE_CONTROL.notFound);
  }

  if (!origin.ok) {
    console.error(`GCS ha respondido ${origin.status} para ${objectPath}`);

    return plain(502, 'Bad Gateway', CACHE_CONTROL.error);
  }

  const headers = new Headers();

  for (const name of KEPT_HEADERS) {
    const value = origin.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  headers.set('Cache-Control', CACHE_CONTROL.ok);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Son imágenes públicas: que se puedan usar desde cualquier origen (canvas, otros sitios).
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(origin.body, { status: 200, headers });
}

function plain(status, text, cacheControl) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cacheControl },
  });
}

/**
 * Token OAuth 2.0 de la cuenta de servicio: un JWT firmado con su clave privada (RS256) que se
 * cambia por un access token de una hora. Se guarda en memoria y se renueva cinco minutos antes
 * de caducar.
 */
async function getAccessToken(env) {
  const now = Date.now();

  if (accessToken && accessToken.expiresAt > now) {
    return accessToken.value;
  }

  const assertion = await signJwt(env, Math.floor(now / 1000));

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  if (!response.ok) {
    throw new Error(`oauth2 ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  accessToken = { value: data.access_token, expiresAt: now + (data.expires_in - 300) * 1000 };

  return accessToken.value;
}

async function signJwt(env, issuedAt) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: env.GCS_CLIENT_EMAIL,
    scope: GCS_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));

  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await getSigningKey(env), new TextEncoder().encode(input));

  return `${input}.${base64url(signature)}`;
}

async function getSigningKey(env) {
  if (signingKey) {
    return signingKey;
  }

  // El PEM del JSON de la clave: se quitan cabecera, pie y saltos de línea y queda el DER PKCS#8.
  const pem = env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n');
  const der = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(der), (c) => c.charCodeAt(0));

  signingKey = await crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return signingKey;
}

function base64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
