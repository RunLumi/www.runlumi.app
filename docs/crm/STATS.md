# CRM stats on the Reports page (`/crm/reports`, `/vi/crm/reports`)

Owner decisions 2026-11-02: build in two steps; add ward/district/city fields;
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

The stats form and the sales overview form carry each other's filters, so
filtering one never resets the other.

## Who sees what

- Permission `crm.stats`: Sales Manager, Sales Executive, and Admin (all
  permissions). Partners, Finance and Fulfillment keep the earlier Reports sections instead.
- Every query uses the viewer's own scope: team-wide roles (`crm.team`) see
  everyone's leads and deals; others only what they own. Filter options
  (cities, districts, wards, industries) come from records the viewer can see.
- Only team-wide roles may filter by owner.

## Filters and comparison

- One period (`from`, `to`; at most 366 days, never past today) and one
  playbook for the funnel apply to every set.
- Up to five filter sets (`n`, `s<i>_city|district|ward|industry|source|owner|label`).
  A ward value carries its district and city (`Phường 13|Quận 4|TP. Hồ Chí Minh`)
  so equally named wards in different districts never mix.
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
| Breakdown | For one set: by the area level below its own area filter, by industry and by source (replaces the old leads-by-source table) |

A rate with nothing to divide by shows "—", not 0%.

## Ward, district and city

- Columns `ward`, `district`, `city` on `crm_accounts` and `crm_lead_records`
  (migration 0057, additive). `district` keeps the familiar name (“Quận 4”)
  even after the 2025 merger removed the district tier.
- Values are normalised on save (`Q4` → `Quận 4`, `p.12` → `Phường 12`,
  `tp hcm` → `TP. Hồ Chí Minh`). Blank fields are filled from the address or
  area text only where a part is explicitly marked (Phường/P., Quận/Q., Huyện,
  Xã, a known city); unmarked text is never guessed. Numbered districts imply
  TP. Hồ Chí Minh.
- Older records: a CRM admin (`crm.configure`) can run “Fill areas from
  addresses” on the Reports page. It changes only fully blank records, bumps
  their version and writes one `crm_area_backfill` audit row.
- The CRM API/MCP `create_company` and `update_company` accept and return
  `ward`, `district`, `city`.

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
