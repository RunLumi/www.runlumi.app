# CRM stats (`/crm/stats`, `/vi/crm/stats`)

Owner decisions 2026-11-02: build in two steps; add ward/district/city fields;
access follows CRM permissions.

## Who sees what

- Permission `crm.stats`: Sales Manager, Sales Executive, and Admin (all
  permissions). Partners, Finance and Fulfillment have no stats page.
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
| Converted / disqualified | Of those leads, by state now |
| New opportunities | Opportunities of the chosen playbook created in the period |
| Won / lost | Of those opportunities, by outcome now |
| Won value | Sum of known values only; shown with coverage, never counting unknown as 0 |
| Funnel | Share of those opportunities that reached each open stage (stage history plus the current stage); skippable stages count only deals that went through them |
| Open pipeline | Opportunities open today, any creation date, by current stage |
| Trend | New leads, new opportunities or wins per day (per week from 63 days) |
| Breakdown | For one set: by the area level below its own area filter, and by industry |

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
  addresses” on the stats page. It changes only fully blank records, bumps
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
