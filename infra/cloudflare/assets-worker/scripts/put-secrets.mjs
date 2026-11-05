/**
 * Sube al Worker los dos secretos de la cuenta de servicio `ff-assets-reader` a partir de su
 * clave JSON (la que se descargó con `gcloud iam service-accounts keys create`). La ruta del
 * JSON se pasa como argumento o en GCS_READER_KEY_FILE; por defecto, la del equipo de Eduardo.
 *
 *   npm run secrets -- ~/.config/fantasyfutbol/ff-assets-reader.json
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2] ?? process.env.GCS_READER_KEY_FILE ?? join(homedir(), '.config/fantasyfutbol/ff-assets-reader.json');
const key = JSON.parse(readFileSync(file, 'utf8'));

for (const [name, value] of [['GCS_CLIENT_EMAIL', key.client_email], ['GCS_PRIVATE_KEY', key.private_key]]) {
  execFileSync('npx', ['wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}
