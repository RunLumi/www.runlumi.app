# ADR-0001: One shell with module tabs, grouped menus and shared table components

- **Status:** Accepted, 2026-10-29 (workstream 1)
- **Context:** The redesign rules R-03 to R-05 apply to every module, and four workstreams build screens in parallel. Without shared parts, each module would build its own table, breadcrumbs and menus.

## Decision

- **Shell.** `WorkspaceShell` keeps the two-row structure.
  - Row 1 has the brand, the module tabs, the language switch and the account menu. Below 1024 px, the module tabs become a `<details>` launcher.
  - Row 2 names the current module and lists its pages:
    - as tabs, when the module has no groups;
    - as a grouped sidebar, when it has groups (CRM, HRM, Finance, Admin). Below 1024 px the sidebar becomes a Menu disclosure.
- **Shared components.** The UI rules live in `src/components/workspace/ui/`, styled by `src/styles/workspace.css`: `DataTable`, `PageHeader`, `Breadcrumbs`, `PanelRow`, `Panel`, `FactRow` and `GroupedMenu`.
  - Frozen columns use CSS `position: sticky` with `nth-child` offsets taken from custom properties. No script measures widths.
- **Navigation map.** Navigation still comes only from `src/lib/workspace/nav.ts`. Every link in a grouped module must name a group.
- **Header material.** The glass header follows DESIGN.md §8.4: opaque first; blur only within `@supports`; opaque under reduced transparency or more contrast.

## Consequences

- Modules get R-03 to R-05 by composing these components. Fixes land in one place.
- Frozen columns need fixed widths for the frozen cells, and body rows cannot `colspan` across them.
- Pop-overs built on `<details>` do not close on an outside click. That is accepted, because they need no script.
