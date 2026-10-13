# Lumi CRM API and MCP server

AI agents and scripts can read and update the CRM through:
- a **REST API** at `/api/crm/v1`;
- an **MCP server** at `/api/crm/mcp`.

Both accept personal API tokens and expose the same operations. Each operation calls the same functions as the CRM pages. Ownership, validation, stage requirements, do-not-contact, version checks and the audit history all work exactly as they do in the browser.

## 1. Tokens

- **Where.** CRM → Guides and tools → **Connect an AI agent** (`/crm/api`, `/vi/crm/api`). The page walks through creating a token, storing it, connecting Claude Code, Codex or another MCP client, first prompts, limits and error codes. Every CRM role can create its own tokens.
- **Scope.** A token is *read only* or *read and write*.
- **Lifetime.** 30, 90 or 365 days. Each person can hold at most 10 active tokens.
- **Shown once.** The secret appears only in the response to the create form. It is never put in a URL. Only its SHA-256 hash is stored, in `crm_api_tokens` (migration `0009`).
- **Who the token acts as.** The person who created it. Every request re-checks that person's EmDash account, Workspace membership and roles. A token stops working when:
  - the token is revoked or expires;
  - the account is disabled;
  - the person loses CRM access.

  Unknown, expired and revoked tokens all receive the same `401`.
- **Losing access ends tokens.** When an admin disables someone's Workspace access, or removes their last CRM role, all of that person's tokens are revoked. Restoring access later does not bring old tokens back.
- **EmDash-level disable.** Disabling the account in EmDash stops its tokens while it stays disabled. Re-enabling the account there revives them, so revoke them on the API page as well.
- **Revoking.** People revoke their own tokens. Admins see and revoke everyone's.
- **Rate limit.** 120 requests per minute per token. Over the limit, the API returns `429` with `Retry-After`.
- **Audit.** Changes appear in history as `Name (API: token name)`. Brackets are stripped from token names so a name cannot imitate another actor.
- **Never hiring.** Tokens grant CRM permissions only. Hiring pages and `/api/admin/*` accept EmDash sessions alone.
- **No cookies.** The API ignores browser session cookies, so another site cannot make a browser call it on someone's behalf. The MCP endpoint also refuses requests from any browser origin other than runlumi.app.

## 2. What an agent can and cannot do

| Can | Cannot |
|---|---|
| Search and read the companies, contacts and opportunities the person may see | Anything the person cannot do in the CRM |
| Create companies (optionally with a first contact) and contacts | Take or record payments, quotes, refunds or the ledger |
| Open an opportunity for a company and one of its contacts | Fulfillment, commission, payouts |
| Update company and contact details and opportunity details | Assign or reassign owners (use the CRM) |
| Record discovery fields, move stages when requirements are met, add notes | Configure playbooks, offers or users |
| Record a do-not-contact request | Lift do-not-contact |

Team-wide roles (Sales Manager, Admin) may set `owner_id` when creating records. Everyone else owns what they create.

## 3. REST

Send `Authorization: Bearer <token>`. Request bodies are JSON (`Content-Type: application/json`, at most 64 KB). Responses use one envelope:
- success: `{ "ok": true, "data": … }`;
- failure: `{ "ok": false, "error": { "code", "message", "fields"? } }`.

| Method and path | Operation |
|---|---|
| `GET /me` | `whoami` |
| `GET /playbooks` | `list_playbooks`: stages, requirements, field keys, channels |
| `GET /companies?q=&owner=&page=` | `search_companies` |
| `POST /companies` | `create_company` (201) |
| `GET /companies/{id}` | `get_company`, with the contacts and opportunities you may see |
| `PATCH /companies/{id}` | `update_company` |
| `POST /companies/{id}/do-not-contact` | `set_do_not_contact` (`contact_id` optional) |
| `GET /contacts?q=&owner=&page=` | `search_contacts` |
| `POST /contacts` | `create_contact` (201) |
| `PATCH /contacts/{id}` | `update_contact` |
| `GET /opportunities?q=&playbook=&stage=&outcome=&page=` | `search_opportunities` |
| `POST /opportunities` | `create_opportunity` (201) |
| `GET /opportunities/{id}` | `get_opportunity` |
| `PATCH /opportunities/{id}` | `update_opportunity` |
| `PATCH /opportunities/{id}/fields` | `update_opportunity_fields` (`{ "fields": { key: value } }`) |
| `POST /opportunities/{id}/stage` | `move_stage` |
| `POST /opportunities/{id}/notes` | `add_note` (201) |

**PATCH.** Only the fields you send change. To have the write rejected if someone else changed the record since you read it, send the `version` you read. A stale version returns `409`.

**Retries.** Send an `Idempotency-Key` header (16–100 characters from `A–Z a–z 0–9 _ -`). A malformed key is refused with `422`.
- **Same key, same operation, same arguments:** the retry writes nothing new.
- **Same key, different write:** treated as a new write; it is never silently dropped.
- **Separate per person:** keys never collide between people.

**Status codes.**
- `401` — invalid, expired or revoked token.
- `403` — the role does not allow it, or the token is read-only (`read_only_token`).
- `404` — not found, or not visible to you.
- `409` — stale version.
- `422` — validation. `fields` holds codes such as `invalid`, `required`, `suppressed`, `do_not_contact`, or `missing:<requirements>` for a stage move.
- `429` — rate limited.

Search text in a `GET` query string can appear in request logs. Search by phone number or email through MCP, which sends the text in the body.

**Forecast fields.** Opportunities carry `estimated_value_vnd`, the expected contract value in VND, and `win_probability`, the expected win probability from 0 to 100. Either may be `null`, which means unknown. `create_opportunity` and `update_opportunity` accept both.

**Opportunity history.** `get_opportunity` returns only notes, stage, field, detail and contact events. Money, fulfillment, assignment and referral events stay in the CRM.

```bash
curl -H "Authorization: Bearer $LUMI_CRM_TOKEN" "https://runlumi.app/api/crm/v1/companies?q=bakery"
curl -X POST -H "Authorization: Bearer $LUMI_CRM_TOKEN" -H "Content-Type: application/json" \
  -d '{"company_id":"acc_…","name":"Nguyễn Lan","role":"owner","phone":"0901234567"}' \
  https://runlumi.app/api/crm/v1/contacts
```

## 4. MCP

The server follows the Streamable HTTP transport. It is stateless and answers with JSON, never with SSE streams.
- **Supported protocol versions:** `2025-06-18`, `2025-03-26` and `2024-11-05`.
- **Methods:** `initialize`, `ping`, `tools/list` and `tools/call`. Notifications receive `202`.
- **Tool list:** read-only tokens see only the read tools. Every tool carries `readOnlyHint`. `set_do_not_contact` is marked `destructiveHint`, because only an admin can undo it.
- **Retries:** pass `_meta.idempotency_key` per `tools/call`. The `Idempotency-Key` header is ignored on MCP, because a client would send the same header with every call.
- **Errors:** a failing tool returns a result with `isError: true` and a `structuredContent.error` shaped like the REST error.

To connect Claude Code, keep the token in an environment variable, not in a file in a repository:

```bash
claude mcp add --transport http lumi-crm https://runlumi.app/api/crm/mcp --header "Authorization: Bearer $LUMI_CRM_TOKEN"
```

Other MCP clients need two things: the URL and an `Authorization: Bearer` header. A client that cannot send headers can use a local bridge that adds the header.

The server's instructions tell the agent:
- record only what the customer or the user said;
- leave unknown values empty;
- call `list_playbooks` before creating or moving opportunities;
- record do-not-contact requests;
- never contact customers itself.

## 5. Code map

| File | Role |
|---|---|
| `src/lib/crm/api/tokens.ts` | Create, list, revoke, authenticate, rate limit |
| `src/lib/crm/api/tools.ts` | The operations and their JSON Schemas (single source for REST and MCP) |
| `src/lib/crm/api/http.ts` | Bearer auth, JSON bodies, idempotency, error mapping |
| `src/pages/api/crm/v1/[...path].ts` | REST routes |
| `src/pages/api/crm/mcp.ts` | MCP JSON-RPC |
| `src/pages/crm/api.astro`, `src/components/crm/ApiTokensView.astro` | Token page (EN/VI) |
| `tests/integration/api.integration.test.mjs` | End-to-end checks against a local Worker |

**Adding an operation.** Add a `Tool` that calls an existing CRM function, so that permission checks stay in one place. Set `write` correctly. Add a REST route if one is useful, then a test.
