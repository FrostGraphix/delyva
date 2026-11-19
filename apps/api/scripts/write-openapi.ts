import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '@delyva/contracts';

const out = fileURLToPath(new URL('../../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument('0.1.0'), null, 2)}\n`);
process.stdout.write(`OpenAPI 3.1 spec written to ${out}\n`);
