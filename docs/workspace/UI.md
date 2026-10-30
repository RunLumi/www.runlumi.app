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

## Round 2 kit (board parity, story UI1-S7)

Use these to match the boards ([UI-PARITY.md](../redesign/UI-PARITY.md)). Values come from the boards' stylesheet, ported onto the app tokens in `workspace.css`. Never link `lumi.css` or copy board HTML.

| Board pattern | Component | Use |
|---|---|---|
| Buttons `.btn` | class `ws-btn` (+ `primary`, `ghost`, `neutral`, `sm`, `icon`, `on`, `danger`, `won`, `lost`) | On `<a>` or `<button>`. Height 36 px, blue text, 6 px radius, as drawn. |
| Button group `.bg` | `ButtonGroup` | `label` names the group; children are `ws-btn`. `more=[{label, href}]` adds the trailing ▾ menu (links to real screens or `#sheet-id`). |
| List-view header `.oh` + `.lv-meta` | `ListHeader` | One white panel per list screen: `icon`, `tone` (`lead`, `opportunity`, `company`, `contact`, `event`, `task`, `report`, `setup`, `home`, `person` or a colour), `object` (eyebrow), `title` (list name), `lists` (the list selector), `meta` (the "9 items · sorted by …" line). Slots: `actions` (a `ButtonGroup`), `tools` (a `ListToolbar`), default (the `DataTable` or board). No page title or lede above it. |
| List toolbar | `ListToolbar` | GET search in this list (`q`, `keep` for other filters), `views` (table/Kanban/calendar links with icons), the filter pop-over (`filterClear` + fields in `slot="filters"`, `filterActive` count, `filterKeep` hidden fields; one GET form with Apply and Clear), then icon buttons (`ws-btn icon`) in the slot. |
| Object square `.oi` | `ObjectIcon` | Used by the headers and related lists. |
| Record header `.oh` + `.hl-row` | `RecordHeader` | `crumbs` back to the list (R-03), `object`, `title`, `highlights=[{label, value, href?, tone?}]` (up to six). Slots: `actions`, `sub`, default (for example a `Path` below the highlights). |
| Path `.path` | `Path` | `steps=[{label, state: done/current/todo/selected/won/lost, href?}]`, the main action in `slot="action"`. Steps come from the playbook or status list (R-01), never from code. |
| Record tabs `.rtabs` | `RecordTabs` | Links with `?tab=` (or any URL); the server renders the chosen panel. |
| Related list `.rl` | `RelatedList` | `title`, `count`, `icon`, `tone`, `href` + `hrefLabel` ("View all" or "New"), header buttons in `slot="actions"`, `items=[{title, href, meta, fields}]` or rows (`ws-rl-row`) in the slot, `empty` (shown when `items` is empty or `count` is 0), `wide` (full row), `slot="foot"`. |
| Path panel (LeadRecord, DealRecord) | `PathPanel` | `Path` + main action (`slot="action"`) + two columns for key fields and guidance (default slot). |
| Activity feed | `Feed` | `items=[{title, meta, when, kind: note/task/event/warn}]`, `empty`. |
| Setup page (Settings) | `SetupFrame` | Header panel (`icon`, `eyebrow`, `title`, `tone`, `slot="badges"`, `slot="actions"`) with the blue `info` note, then panels. |
| Sheet / dialog `.dlg` | `Sheet` (right) and `Dialog` (centred) | Create and edit open here, never inline. Give it an `id` and link to `#id`: it opens with no script and no round trip. Pass `open` to re-show it from the server (a form with errors) and `closeHref` back to the page. `action` makes body + foot one POST form (`method`, `enctype` for uploads); buttons go in `slot="foot"`. `wide` = 720 px, `width` any width. Escape and focus come from the shell. |
| Form grid `.fgrid2` | `FormGrid` + `FormField` | `cols` 1–3 (one on phones). `FormField` has `label`, `for`, `required`, `hint`, `error`, `span`; the control in the slot gets the board's input look. |
| Badges, toggles | classes `ws-badge` (`info`, `ok`, `warn`, `bad`), `ws-state` (`on`, `lock`) | `ws-state` shows a state; it is not a control. |

Glyphs for toolbars and cards are in `NavIcon`: `refresh`, `filter`, `left`, `right`, `table`, `warn`, `grip`, `tasks` (and `search`, `plus`, `help`, `bell`, `chevron`).

Create actions in the header's + menu come from `createActions` in `nav.ts`. When a list moves its create form into a `Sheet`, give the sheet the `id` that action links to (`#new-lead` on `/crm/leads`, `#new-h` on `/crm/referrals` and `/admin/jobs`) or change the action's `path` in the same commit.

### Example: a list screen

```astro
<ListHeader vi={vi} icon="leads" tone="lead" object="Lead" title={vi ? "Lead đang mở" : "Open leads"} meta={`${total} ${vi ? "mục" : "items"} · ${vi ? "Sắp xếp theo ngày tạo" : "Sorted by created date"}`}>
  <ButtonGroup slot="actions" label={vi ? "Hành động" : "Actions"} more={[{ label: vi ? "Cài đặt trạng thái" : "Lead statuses", href: "/vi/crm/admin/leads" }]}>
    <a class="ws-btn" href="#new-lead">{vi ? "Tạo" : "New"}</a>
  </ButtonGroup>
  <ListToolbar slot="tools" vi={vi} q={filters.q} keep={{ state: filters.state }} views={[{ key: "table", label: "Bảng", href: "?view=table", icon: "model", current: true }, { key: "board", label: "Kanban", href: "?view=board", icon: "pipeline" }]} />
  <DataTable vi={vi} label="Lead" frozen={1} widths={["16rem"]}>…</DataTable>
</ListHeader>
<Sheet id="new-lead" vi={vi} title={vi ? "Tạo Lead" : "New lead"} action="" open={state.intent === "lead_create"} closeHref="/vi/crm/leads">
  <input type="hidden" name="intent" value="lead_create" />
  <FormGrid><FormField label="Tên" for="l-name" required><input id="l-name" name="name" autofocus /></FormField>…</FormGrid>
  <Fragment slot="foot"><a class="ws-btn" href="/vi/crm/leads">Hủy</a><button class="ws-btn primary">Lưu</button></Fragment>
</Sheet>
```

### Parity screenshots

`node scripts/parity-shots.mjs Leads=/crm/leads "LeadRecord=/crm/leads/<id>" --seed` starts an isolated local Worker, signs in (dev-bypass admin, or `--as sales_executive` for a TEST member), adds TEST records with `--seed`, and writes `docs/redesign/parity/<Board>/{board-1440,app-vi-1440,app-en-1440,app-vi-390}.png`. Append `@<css selector>` to a path to click before the shot, and `#id` to open a sheet. Pass `--base http://127.0.0.1:<port> --persist <dir>` to reuse a Worker you already run.

## Example (round 1)

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

## Shell (boards TopNav, AppLauncher, SetupNav)

`WorkspaceShell` reads `src/lib/workspace/nav.ts`:
- Row 1, the global header: logo and "Lumi Workspace", the search field (GET `/workspace/search`), create (+, `visibleCreateActions`), help (?, the CRM "help" group), the bell (only with a notice source, `/workspace/inbox`) and the avatar menu (identity, My account pages, language, sign out).
- Row 2, the app nav bar: the 9-dot launcher (module tiles; it is the `ws-modules` nav the tests read), the app label, then the page tabs (`ws-pages`). A grouped module with `layout: "tabs"` (CRM) shows links marked `tab: true` and puts the rest in a "More" menu (`ws-gmenu`). Modules with `layout: "side"` (HRM, Finance, Admin) get the SetupNav side navigation on wide screens and a page menu in the app bar below 1024 px.
- Child screens pass `current` (the nav link key of their parent list), so the parent stays highlighted.
- Everything works without script. A small inline script adds Escape-to-close, closing pop-overs on an outside click, focus for an opened sheet, and the launcher and side-nav filters (their fields stay hidden without script).
