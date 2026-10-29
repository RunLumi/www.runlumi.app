# Workspace UI components

Shared Astro components for the redesign UI rules in [docs/redesign/README.md](../redesign/README.md) (R-03 to R-05). They live in `src/components/workspace/ui/`, and their styles are in `src/styles/workspace.css`. `WorkspaceShell` loads those styles for every private page.

Rebuild screens with these components. Never copy board HTML or `lumi.css`.

| Rule | Component | Use |
|---|---|---|
| R-03 | `DataTable` | A table that fills the content area. Put `<thead>`/`<tbody>` in the default slot. `frozen={1..3}` keeps the leading columns in place during horizontal scroll, and `widths` sets their widths (capped on phones). `frozenNames` names them in the footer hint, and `meta` adds a count such as "1–20 of 84". |
| R-03 | `PageHeader` with `crumbs` | A child screen opened from a table row. The crumbs lead back to the list, and the last crumb is the current page. Actions go in `slot="actions"`. |
| R-03 | `Breadcrumbs` | The crumbs on their own, if a page builds its own header. |
| R-04 | `PanelRow` + `Panel` | Panels on one row share one height. Panel actions go in `slot="foot"`, which sits at the bottom, so the buttons line up. `min` sets the width below which panels stack. |
| R-04 | `FactRow` | Summary facts across the top of a child screen. |
| R-05 | `GroupedMenu` | A menu in labelled groups. The group label is a caption with a rule, never a link or a padded row. The shell uses it for module sidebars. |

## Example

```astro
---
import DataTable from "../components/workspace/ui/DataTable.astro";
import PageHeader from "../components/workspace/ui/PageHeader.astro";
---
<PageHeader vi={vi} title="Hải Ngân" crumbs={[{ label: "Quản trị", href: "/vi/workspace/users" }, { label: "Người dùng", href: "/vi/workspace/users" }, { label: "Hải Ngân" }]} />
<DataTable vi={vi} label="Người có quyền" frozen={1} widths={["16rem"]} frozenNames="Tên" minWidth="960px" meta="1–8 trên 8">
  <thead><tr><th scope="col">Tên</th><th scope="col">Email</th>…</tr></thead>
  <tbody><tr><th scope="row"><a class="ws-row-link" href="…">Hải Ngân</a></th><td>…</td></tr></tbody>
</DataTable>
```

## Table conventions

- **Row opens a child screen.** The first cell holds a `ws-row-link` to the record. That keeps the row usable by keyboard, without client script.
- **Group rows.** Use `<tr class="ws-tbl-group"><th scope="rowgroup">…</th><td colspan="…"></td></tr>`. The first cell stays frozen.
- **Frozen columns.** The `nth-child` rules count cells, so do not `colspan` across frozen columns in body rows.
- **Filters.** Use plain links (`ws-chips`, with `aria-current="true"` on the active one) and a GET `ws-search` form. Both work without JavaScript.

## Shell

`WorkspaceShell` reads `src/lib/workspace/nav.ts`:
- Row 1 holds the brand, the module tabs (a launcher below 1024 px), the language switch and the account menu.
- Row 2 holds the current module's name and, for modules without groups, its page tabs.
- A module with `groups` gets the `GroupedMenu` sidebar on wide screens, and a Menu disclosure on narrow ones.
- Child screens pass `current` (the nav link key of their parent list), so the parent stays highlighted.
