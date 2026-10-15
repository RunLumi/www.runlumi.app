# CRM Files

The Files menu opens `/crm/files` or `/vi/crm/files`. It uses the existing EmDash
session and current Workspace permissions. It is not exposed through CRM personal
tokens or MCP. Recipients have read/download access; only the owner can create
children, rename, change sharing, or delete an item. Admin/manager status does not
bypass private sharing.

## Version history

The owner can upload a new version from the file details panel. The file keeps
its name, location and sharing settings. Each upload uses a new R2 object; older
versions remain downloadable in a paginated history, including from a public
link while the file is public. Sharing changes and revocation apply to **all**
versions. A revision ID alone grants no access.

Only a version's uploader or an admin (`users.manage`) may delete that version,
with confirmation and a version guard. Admin status does not bypass private-file
visibility: the admin must already have access to the file. Viewers cannot upload
or delete. Deleting the current version selects the newest remaining version;
deleting the last version removes the file. Deleted versions cannot be downloaded
or resurrected. Numbers are never reused. The file owner cannot bypass another
uploader's deletion rights by deleting the whole file. The UI uses individual
version deletion for files and empty-folder deletion for folders.

Migration `0013_crm_file_versions.sql` backfills version 1 for any existing live
files, without copying or overwriting their bytes. SQL triggers atomically update
the current version and audit on upload/deletion. Deleted bytes are removed after
the metadata tombstone; a failed R2 deletion leaves them inaccessible and available
for operator cleanup using the recorded key.

## Sharing

- **Private:** owner only. This is the default for root items.
- **Sales team:** current `crm.files.team` permission, granted centrally to sales
  managers, sales executives, and EmDash admins. Partners, finance, fulfillment,
  and HR do not receive this permission implicitly.
- **Specific people:** selected, active CRM users (including active admins).
  Authentication and current CRM membership are rechecked on each request.
- **Anyone with the link:** anonymous read/download via an unguessable link. The
  owner must explicitly confirm this choice. Pages request no search indexing,
  but this is not a confidentiality control: anyone can forward the link.
- **Use folder sharing:** available for children, and their creation default.
  Resolves the nearest ancestor with an explicit policy at read time. A private
  child remains private even inside a public folder. Folder policy changes affect
  inherited descendants, not items with their own explicit policy.

All files lists filter access before pagination. The home view includes root items
and explicitly shared items from other owners, so an invitation to a file does not
require access to its parent. Ancestor names are never disclosed by that access.
Viewers cannot upload into someone else's folder. Folder depth is limited to 20.

Public links use `/shared/files/:token` and the `/vi` peer. Only children inheriting
that exact public policy can be browsed through that link. Explicitly public child
items have their own link. Changing away from public sharing invalidates the old
link permanently; making the item public again creates a new link. All page and
download responses are `private, no-store`. Revocation cannot recall downloaded
copies or data already sent in an in-flight response.

## Storage and release

Migration `0012_crm_files.sql` adds metadata and an append-only, trigger-written
actor/timestamp audit table. Existing hiring and commercial records are unchanged.
Bytes use the existing private `FILES` bucket under the dedicated `crm-files/`
namespace; ATS file IDs/keys never enter this module. The bucket must remain
private with no public domain. No new bucket or secret is required.

Uploads are limited to 20 MiB per file and the entire multipart request to 21 MiB,
counted while reading. File names reject controls and path separators. Downloads
stream from R2, force attachment/octet-stream, disable sniffing, and apply a sandbox
CSP. This is storage and controlled download, not malware scanning or inline file
execution. Treat downloaded files according to their source.

Writes check ownership, strict same-origin requests and optimistic versions.
Database triggers record changes in the same transaction as metadata. Deleted
metadata is tombstoned immediately, then the R2 object is deleted. Folders must be
empty. If the R2 deletion fails after the tombstone, access remains revoked; an
operator can retry deleting the recorded `crm-files/` key. Failed metadata inserts
attempt to remove their uploaded object; a bucket failure can leave an inaccessible
orphan. Audit and tombstones are retained for operations.

Apply the additive migration through the normal release pipeline before serving
these routes. Follow `RUNBOOK.md` §12. This feature does not itself authorize a
production deployment or publishing any existing file.

## Verification

`tests/crm-files.test.ts` exercises the real SQLite migration and policy queries:
private/manager isolation, team boundaries, explicit recipients, inherited and
public access, permanent link revocation, owner-only changes, stale versions,
nonempty folder protection, file constraints, and safe download headers. Bucket
operations in this unit suite use a double; report real local Worker/R2 and browser
checks separately. Run `npm run ci:verify` as the finish gate.

### Implementation-stage verification — 2026-10-15

- `npm run ci:verify`: passed (lint, 88 unit tests, Astro check and production
  build). Used bundled Node 24.19; the default shell's Node 22.14 cannot load
  these TypeScript tests. The repository declares Node 26, so exact Node 26 and
  hosted verification remain outstanding. Temporary runtime acquisition was
  blocked by the machine's package policy; no dependency changed.
- All 12 migrations applied successfully to an isolated local D1 directory.
- `files.integration.test.mjs`: 4/4 blocks passed through the real local Worker,
  EmDash sessions, D1 and R2, including public links, private overrides and
  immediate membership revocation. An earlier attempt was interrupted by a dev
  server reload; a complete rerun passed after the source settled.
- Chrome/Playwright: EN and VI at 320, 390, 430, 1280 and 1920 px, sharing panel
  at 320 px, anonymous public view at 320/1280 px without JavaScript, visible
  keyboard focus and reduced-motion emulation. No horizontal overflow or page
  JavaScript errors. Screenshots were visually inspected after form styling.
- No production migration, deployment, CMS change, PR or merge performed.


### Release-candidate verification — 2026-10-15

- Fresh `npm ci` from the unchanged lockfile in an isolated worktree.
- `npm run ci:verify` passed on checksum-verified official Node 26.12.0:
  lint, 88 unit tests, Astro check (zero errors) and production build.
- Production preflight confirmed the required Worker secrets exist. Only the
  additive `0012_crm_files.sql` migration is pending. The existing FILES bucket's
  public development URL is disabled.
- The release follows the normal main-branch pipeline. If automatic deployment
  does not complete, use the documented manual fallback from the merged main
  commit; it records a D1 Time Travel restore point before migrating.

- The first complete Node 26 integration run had five local transport failures
  (`ECONNRESET`/closed sockets), with no failing business assertions. A focused
  Files rerun passed 4/4. Integration HTTP requests now close each connection to
  avoid reusing idle workerd sockets; mutations are never automatically retried.


### Versioning follow-up — 2026-10-15

The initial complete integration rerun passed 47/47 on Node 26 after the
connection fix. The owner then requested retained file versions before merge.
Versioning adds tests for old-byte retention, admin/uploader deletion, unauthorized
viewers, current-version fallback, last-version removal, public history, stale
writes and cross-file revision isolation. Final checks are reported in the PR.

- Versioning finish gate: Node 26 lint, 92 unit tests, Astro check and build passed.
  Browser-tested retained history in EN/VI at 320/390/430/1280/1920 px and
  anonymous public history without JavaScript; no overflow or page errors.
