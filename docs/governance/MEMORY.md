# Agent memory

Read this before you start Workspace work, and update it when you learn something.

## Decisions in force

- **Redesign decisions.** R-01 to R-14 are in [docs/redesign/README.md](../redesign/README.md#decisions). R-12 and R-13 are assumptions until the founder confirms them.
- **Structural decisions.** These are in [decisions/](decisions/):
  - ADR-0001: shell and shared components;
  - ADR-0002: account area;
  - ADR-0003: Admin child screens and the roles route.
- **Terms.** Use the app's own words, not the boards':
  - "Công ty", not "Đối tác";
  - "Cơ hội", "Liên hệ", "Cộng tác viên";
  - "Quản trị" for Admin;
  - "Tài khoản của tôi" for personal settings.

## Open questions (for the founder)

1. **Search.** Should Workspace get a cross-module search? The TopNav board has one, but there is no back end. A search must apply each module's permission and ownership rules, so it is a feature, not a redesign.
2. **Notification bell.** HRM keeps its own in-app notices. Should a header inbox collect notices from several modules? That depends on rd4's notification rules.
3. **Avatar photos.** EmDash stores `avatar_id`. Should the account menu show the photo? Initials are used for now.
4. **EmDash security page.** Can EmDash users below admin (role < 50) open `/_emdash/admin/settings/security` to manage their passkeys? The account page links there; rd4's mandatory passkey work should confirm or replace that link.

## Lessons

- **Don't edit `src/` during a local integration run.** `astro dev` hot-reloads, so a run that overlaps an edit fails on half-written markup. Finish the edit, then run.
- **Integration selectors.** The integration tests find menus by class (`ws-modules`, `ws-pages`, `ws-gmenu`). If you rename a shell class, update `tests/integration/workspace.integration.test.mjs` in the same commit.
- **Grouped modules.** In a module with `groups`, a link without a `group` disappears from the menu. The unit test "grouped menus" catches this.
