# Workspace governance

This folder is the working foundation for Lumi Workspace. It holds the redesign governance listed in [docs/redesign/README.md § Governance](../redesign/README.md#governance).

The contracts stay authoritative. On any conflict, these documents lose:
- [AGENTS.md](../../AGENTS.md);
- [docs/workspace](../workspace/README.md);
- [docs/crm](../crm/README.md);
- [docs/specs/hrm](../specs/hrm/README.md) and [docs/specs/finance](../specs/finance/README.md).

| Document | Holds | Update when |
|---|---|---|
| [FEATURES.md](FEATURES.md) | Feature list per module, with status and where the evidence is | A feature ships, changes status, or is cut |
| [NFR.md](NFR.md) | Non-functional requirements, each with a target and its proof | A target changes, or new proof replaces old proof |
| [USER-STORIES.md](USER-STORIES.md) | User stories per Workspace role, with acceptance criteria and the forbidden case | A role or permission changes |
| [MEMORY.md](MEMORY.md) | Agent memory: decisions in force, open questions, lessons | A decision is taken or an assumption is proven wrong |
| [decisions/](decisions/) | Decision records (ADR) for structural choices | You choose a structure that later work must follow |

## Rules

- **Status words.** Use `Live`, `Built (gated)`, `In redesign`, `Planned` or `Not planned`.
  - "Live" means merged to `main`, with its production gate on.
  - A branch is never "Live".
- **Evidence.** Every status and every NFR names its evidence: a test file, a status document, or a gate result with its commit. A green build alone is not proof of behaviour.
- **Forbidden cases.** Each forbidden case in a user story needs a denied test. Name that test, or mark the gap as open.
- **ADRs.** Number ADRs in order. A decision is changed by a new ADR that supersedes the old one, never by editing it.
