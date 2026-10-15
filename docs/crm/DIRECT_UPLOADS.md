# Direct R2 uploads

CRM file bytes go from the browser directly to R2's S3 endpoint. The CRM Worker
accepts JSON metadata only: it authorizes and signs a PUT URL, then verifies an R2
HEAD and commits metadata/version history after the browser completes the PUT.
New files and new versions both use this flow. Old multipart upload actions are
rejected. Downloads retain their existing authenticated/private-link access path.

## Protocol

1. The browser queues at most 20 files (one file for a version). Each is at most
   20 MiB. It sends one metadata request at a time to `POST /crm/files/uploads`
   with `action: sign`, `name`, `size` and either `parent` or `fileId` + `version`.
2. The server rechecks active EmDash/Workspace access and folder/file ownership,
   records a reservation, and returns a five-minute S3 presigned PUT URL.
3. The browser PUTs the `File` directly to R2 with `Content-Type:
   application/octet-stream` and `If-None-Match: *`. The browser supplies the
   signed Content-Length from the File body. No file bytes go to the CRM route.
4. A metadata-only `action: complete` with `uploadId` rechecks current access,
   reservation ownership/expiry, exact R2 object size/type and version guards.
   Metadata, initial/version records and completion state commit atomically.
   Repeated completion does not duplicate files or resurrect deleted records.

The signer allocates a random `crm-files/direct/` key; callers cannot choose
bucket names, object keys, arbitrary destinations or methods. Signed headers bind
length, content type and the create-only condition. Revoking CRM membership blocks
new signatures and metadata completion; an already-issued PUT capability remains
usable until its five-minute expiry but cannot register a file after revocation. A reusable URL cannot
overwrite a live object. Expired reservations cannot register a file. Old versions
remain separate objects and retain the file's current sharing policy.

Reservations are limited to 20 outstanding and 60 per minute per user. The client
never automatically retries a PUT. If its response is lost, completion's HEAD can
confirm whether it reached R2. Other uncertain failures stop the queue and ask the
user to inspect Files before retrying. Per-file results distinguish saved,
invalid, unconfirmed and not-sent files. No URLs or credentials are logged.

File uploads require JavaScript for the cross-origin PUT/completion protocol;
folder creation, sharing and downloads still work without it. The picker remains
keyboard-accessible and available on touch devices. Folder drops are rejected.

## Production setup

1. Create an R2 S3 API token with **Object Read & Write** scoped only to the
   existing `lumi-job-files` bucket. Keep the bucket private. Public bucket access
   is not needed. Only allocated CRM keys are signed by this application.
2. Set Worker secrets `CRM_R2_ACCESS_KEY_ID` and `CRM_R2_SECRET_ACCESS_KEY` from
   the token's Access Key ID and Secret Access Key. Never put them in Git, chat,
   build variables, command arguments or logs. Use Wrangler's prompted secret
   entry or the Cloudflare dashboard. The Worker returns 503 if these are absent.
3. Inspect existing CORS first, then merge the narrow PUT rule in
   [r2-upload-cors.json](r2-upload-cors.json). It allows only the three production
   origins and the required headers. CORS does not grant access without a valid
   signature and does not make objects public. Preserve unrelated existing rules.
4. Apply additive migration `0014_crm_direct_uploads.sql` and deploy through the
   normal main release pipeline. The existing restore-point requirement remains.
5. Verify a real browser PUT reaches R2's S3 host and only small JSON requests
   reach `/crm/files/uploads`; verify completion, CORS, overwrite rejection,
   retained versions and access revocation. Local tests alone do not prove the
   production credential, CORS or provider path.

The existing ten-minute cron removes up to 100 abandoned reservations' objects
per run after expiry plus a one-hour grace, never a live registered version. It also removes objects replayed into an explicitly deleted version’s key before its signed URL expired. Metadata
and audits remain in D1. An interrupted cleanup retries on the next run. R2
requests started before expiry may finish later; operators can inspect old
unregistered reservation keys during retention review. Do not attach a blanket
lifecycle rule to `crm-files/direct/`: completed live versions use that namespace.

## Local verification

Use an isolated checkout and local D1/R2 persistence. A reproducible setup is:

```sh
export CRM_BASE_URL=http://127.0.0.1:4391
export LUMI_PERSIST_TO=$(mktemp -d)
npm run test:files:prepare
./node_modules/.bin/wrangler d1 migrations apply lumi-jobs --local --persist-to "$LUMI_PERSIST_TO"
CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH=.wrangler/crm-upload-test.jsonc ./node_modules/.bin/astro dev --host 127.0.0.1 --port 4391
# In another shell with the same CRM_BASE_URL and LUMI_PERSIST_TO:
npm run test:integration
```

The setup script writes only an ignored `.wrangler` config, using synthetic
credentials and local bindings. It does not overwrite `.dev.vars`, copy any
production credential, or give the test Worker production routes. Keep a separate
checkout for this test server and do not build concurrently with it.

Current Wrangler/Miniflare
supports a local S3 endpoint via the FILES R2 binding's development-only
`local_dev.experimental_s3_credentials` option. Use synthetic credentials only.
The endpoint is `/cdn-cgi/local/r2/s3/lumi-job-files` on the local dev server.

The ignored test Wrangler config must set matching synthetic runtime variables
`CRM_R2_ACCESS_KEY_ID`, `CRM_R2_SECRET_ACCESS_KEY`, and
`CRM_R2_LOCAL_ENDPOINT=http://127.0.0.1:4402/cdn-cgi/local/r2/s3`. Start Astro with
`CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH` pointing at that config and
`LUMI_PERSIST_TO` pointing at the isolated state. Adjust relative main/assets/
migration paths if the config lives below the repository root. Never run this
configuration as a production deploy.

The local endpoint override is honored only for loopback page origins and a
loopback HTTP endpoint. Production always signs the fixed account's R2 HTTPS
endpoint. Integration tests refuse production base URLs and assert that PUTs use
the local S3 endpoint before sending bytes. A real S3 PUT/HEAD round trip is
reported separately from unit doubles and from production provider verification.

Sources checked 2026-10-15: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/),
[S3 conditional PUT compatibility](https://developers.cloudflare.com/r2/api/s3/api/),
[bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/), and the installed
Wrangler schema/Miniflare S3 implementation.

## Verification record — 2026-10-15

- Node 26.12.0 `npm run ci:verify`: lint, 101 unit tests, Astro checks and production
  build passed. The local S3 config preparation command also completed.
- Real local Worker/D1 and Miniflare native R2 S3 integration: 6/6 passed, including
  valid signed PUT, missing create-only header and wrong signed-length rejection,
  idempotent/owner-scoped completion, metadata body limits, no Worker upload proxy,
  retained versions, public access and revocation.
- Chrome: multiple picker files, actual drag data, a 24 MiB aggregate batch through
  separate S3 PUTs, new version + old version access, removal/clear and validation,
  keyboard focus, reduced motion, EN/VI at 320/390/430/1280/1920 px and the no-JS
  upload notice. No horizontal overflow or page JavaScript errors. Network
  assertions confirmed that the CRM endpoint received only JSON under 4 KiB.
- Production signing secrets were absent and the available OAuth login could not
  create API tokens. The R2 bucket had no CORS configuration. No signing secret,
  production migration, CORS change or deployment was performed during local
  verification. Provider/browser production proof is pending those prerequisites.


### Production prerequisites configured — 2026-10-15

The account owner authorized creation of the non-expiring account-owned token
`runlumi-crm-direct-upload`, with Object Read & Write limited to
`lumi-job-files`. Its two generated keys were transferred through a private
in-memory pipe directly into the `runlumi` Worker secrets; no credential value
was printed, committed or written to a local file. The token's active bucket
scope and secret-name preflight were verified. A real S3 authenticated PUT and
HEAD succeeded, production-origin CORS succeeded, and the temporary synthetic
probe object was removed. Actual application presigned/browser production proof
follows deployment; credential/provider setup alone is not that proof.

Main's HRM P1/P2 changes were reconciled without dropping their role, privacy,
feature-gate or isolated-integration requirements. The shared isolated runner
now prepares synthetic native R2 S3 bindings before the HRM gate and CRM
regressions. No production secrets enter that local configuration.
