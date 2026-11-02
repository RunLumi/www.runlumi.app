# CRM stats on the Reports page (`/crm/reports`, `/vi/crm/reports`)

Owner decisions 2026-11-02: build in two steps; add structured area fields (later: post-merger province and ward only, see below);
access follows CRM permissions; stats are part of Reports, not a separate
page (`/crm/stats` redirects there).

## Page layout

1. Stats by filter (people with `crm.stats`): period, playbook and up to five
   compared filter sets; overview, funnel, open pipeline by stage, trend, and a
   breakdown by area, industry and source.
2. Sales overview (expected value, forecast, win rate, by seller) as before.
3. Without `crm.stats` (Partner, Finance, Fulfillment) the earlier sections stay
   instead of block 1: report filters, opportunities by stage per playbook and
   leads by source, all in the person's own scope.
4. Cohort economics (team or finance) and payments awaiting confirmation
   (finance), unchanged.
5. Areas missing on older records (CRM admins).

All filters of the page sit in one form at the top: period, playbook and the
compared sets; seller and product for the sales overview; and the cohort for
team or finance. The sections below show figures only.

## Who sees what

- Permission `crm.stats`: Sales Manager, Sales Executive, and Admin (all
  permissions). Partners, Finance and Fulfillment keep the earlier Reports sections instead.
- Every query uses the viewer's own scope: team-wide roles (`crm.team`) see
  everyone's leads and deals; others only what they own. Filter options
  (industries) come from records the viewer can see; provinces and wards come from the official list.
- Only team-wide roles may filter by owner.

## Filters and comparison

- One period (`from`, `to`; at most 366 days, never past today) and one
  playbook for the funnel apply to every set.
- Up to five filter sets (`n`, `s<i>_city|ward|industry|source|owner|label`).
  City and ward resolve to official post-merger names; anything else is ignored.
- Area and industry match ignoring letter case, Vietnamese included.
- Leads use their own area/industry; opportunities use their company's.
- The page works without JavaScript (GET form; "Add a set" submits `n+1`).

## Measures

| Measure | Definition |
|---|---|
| New leads | Leads created in the period |
| Converted / disqualified | Of those leads, by state now; the converted % counts decided leads only (converted + disqualified), so open leads are not failures |
| New opportunities | Opportunities of the chosen playbook created in the period |
| Won / lost | Of those opportunities, by outcome now |
| Won value | Sum of known values only; shown with coverage, never counting unknown as 0 |
| Funnel | Share of those opportunities that reached each open stage (stage history plus the current stage); skippable stages count only deals that went through them |
| Open pipeline | Opportunities open today, any creation date, by current stage |
| Trend | New leads, new opportunities or wins per day (per week from 63 days) |
| Breakdown | For one set: by ward when the set has a province, otherwise by province; by industry; and by source (replaces the old leads-by-source table) |

A rate with nothing to divide by shows "—", not 0%.

## Province/city and ward (post-merger map)

Owner decisions 2026-11-02: use Vietnam's administrative map after the 2025
merger (in force 1 July 2025: two tiers, 34 provinces/cities and 3,321 wards,
communes and special zones, no district tier); input must be on that list;
existing data is moved once.

- Source: General Statistics Office unit list (QĐ 19/2025/QĐ-TTg), via
  thanglequoc/VietnameseProvincesDatabase v5.2.0 (MIT), stored compactly in
  `src/data/vn-admin-units.json` and served per province as
  `/areas/<code>.json` for the ward picker.
- Columns `city` and `ward` on `crm_accounts` and `crm_lead_records` hold the
  official full names ("Thành phố Hồ Chí Minh", "Phường Khánh Hội").
  `district` (migration 0057) stays in the schema and is always empty.
- Forms pick the province from the list and the ward from that province's
  list. The server accepts a value only when it is on the list (case, accents
  and the Phường/Tỉnh/TP. prefix do not matter) and stores the official name;
  pre-merger province names map to their new province (Nghị quyết
  202/2025/QH15). Pre-merger wards and districts are refused, never guessed.
  Left blank, both are read from the address only when it names a current
  province and, with its Phường/Xã/Đặc khu marker, a ward of it.
- Migration 0058 (one-off): every stored spelling of a current or pre-merger
  province becomes the official name, anything else ''; a ward is kept only
  when it is an official ward of that province; district ''. Changed rows get
  a new version and one `crm_area_post_merger` audit row records the counts.
- Older records: a CRM admin (`crm.configure`) can still run “Fill areas from
  addresses” on the Reports page (blank records only, same rules).
- Filters: Leads, Pipeline, Companies, Contacts and Reports all filter by
  province and ward (a contact or opportunity uses its company's area). The
  options are only the provinces and wards the CRM's own records use, with
  counts, inside the viewer's scope (Leads: leads; Companies: companies;
  Contacts and Pipeline: their companies; Reports: leads and companies). Forms
  still offer the whole official list. Migration 0059 indexes (city, ward). The
  CRM API/MCP `create_company` and `update_company` take `city` and `ward`.

## Filters

List pages keep their filters in the toolbar pop-over; an open pop-over may
extend past a short or empty list. Reports keeps every filter (period,
playbook, compared sets, sales overview, cohort) in one panel behind the
"Filters" button, with a one-line summary and the set legend left visible.

## Colours

Sets use five categorical slots in fixed order (`--st-1`…`--st-5` in
`src/styles/crm-stats.css`), validated for colour-vision deficiency on the
white sheet (adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 19.6). Slots 3–5 are
below 3:1 against white, so every bar carries its number, every set is named
in a legend and every chart has a table view.

## Step 2 (not built yet)

Outreach figures (Zalo/Facebook messages sent, replies, schedule, shop tier)
live on the outreach machine. Step 2 adds an HMAC-signed endpoint for
aggregated, anonymised outreach counts (no shop names or phone numbers) and the
matching charts.
