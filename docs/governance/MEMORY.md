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

1. **Search.** Decided in the round 2 brief: built as a real feature over what the person may already list (story UI1-S3). Adding HRM or hiring records to search needs its own permission design and a founder decision.
2. **Notification bell.** Decided in the round 2 brief: the bell lists the person's existing in-app notices, today HRM service-request notices only (story UI1-S4). Rules (rd4) send email and webhooks, not in-app notices.
5. **Personal notification settings (SetupNotifications board).** Switches per event and channel, quiet hours, a daily digest and date reminders have no back end. My account › Notifications is read-only until the founder decides whether to build them (they need a preferences table and changes to rule delivery).
3. **Avatar photos.** EmDash stores `avatar_id`. Should the account menu show the photo? Initials are used for now.
4. **EmDash security page.** Can EmDash users below admin (role < 50) open `/_emdash/admin/settings/security` to manage their passkeys? The account page links there; rd4's mandatory passkey work should confirm or replace that link.

## Lessons

- **Match the board, and prove it with screenshots.** Round 1 (PR #116) shipped new features inside the old page scaffold, and the founder found the interface unchanged in production. A screen is done only when its parity screenshots sit next to its board ([UI-PARITY.md](../redesign/UI-PARITY.md)).
- **Spec before code.** Round 1 coded behaviour (referrals become Leads, step-up always on) with no feature row or story, and an agent's "needs founder decision" item shipped unconfirmed. Write the feature row and story with acceptance criteria first; ship nothing a handoff marks as awaiting the founder.

- **Don't edit `src/` during a local integration run.** `astro dev` hot-reloads, so a run that overlaps an edit fails on half-written markup. Finish the edit, then run.
- **Integration selectors.** The integration tests find menus by class (`ws-modules`, `ws-pages`, `ws-gmenu`). If you rename a shell class, update `tests/integration/workspace.integration.test.mjs` in the same commit. Since round 2, `ws-modules` is the launcher's tile list and `ws-pages` the app bar tabs.
- **Old CSS still applies.** `crm.css` keeps round-1 rules for `.ws-modules a`, `.ws-pages a` and `.ws-frame`. New shell rules are prefixed with `.ws` to win; check computed styles in the parity screenshots, not only the source.
- **Grouped modules.** In a module with `groups`, a link without a `group` disappears from the menu. The unit test "grouped menus" catches this.
