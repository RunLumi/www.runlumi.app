// Local fixtures only. Writes an ignored config; never writes .dev.vars or
// production credentials. Uses the repository's existing TypeScript JSONC parser.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const origin = new URL(process.env.CRM_BASE_URL ?? 'http://127.0.0.1:4391');
if (origin.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(origin.hostname) || origin.pathname !== '/') throw new Error('Local loopback CRM_BASE_URL required');
const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc',readFileSync('wrangler.jsonc','utf8'));
if (parsed.error) throw new Error('Cannot parse Wrangler JSONC');
const config = parsed.config;
config.name = 'runlumi-crm-upload-local-test';
config.main = resolve(root,config.main);
config.routes = [];
config.workers_dev = false;
if (config.assets) config.assets.directory = resolve(root,config.assets.directory);
for (const database of config.d1_databases ?? []) {
  database.remote = false;
  if (database.migrations_dir) database.migrations_dir = resolve(root,database.migrations_dir);
}
for (const bucket of config.r2_buckets ?? []) {
  bucket.remote = false;
  if (bucket.binding === 'FILES') bucket.local_dev = { experimental_s3_credentials:{ accessKeyId:'test-crm-s3',secretAccessKey:'synthetic-local-only-not-for-production' } };
}
config.vars = {
  HRM_LIVE_ENABLED:'true',
  CRM_INTAKE_SECRET:'local-test-secret-not-for-production-0123456789',
  CRM_R2_ACCESS_KEY_ID:'test-crm-s3',CRM_R2_SECRET_ACCESS_KEY:'synthetic-local-only-not-for-production',
  CRM_R2_LOCAL_ENDPOINT:`${origin.origin}/cdn-cgi/local/r2/s3`,
};
const target = resolve(root,'.wrangler/crm-upload-test.jsonc');
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(config,null,2)+'\n');
console.log('Prepared ignored local R2 S3 test config. Use only with astro dev and isolated LUMI_PERSIST_TO.');
