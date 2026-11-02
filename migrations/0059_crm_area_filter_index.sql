-- Area filters list only the provinces and wards that CRM records use
-- (owner decision 2026-11-02). Indexes for counting and grouping by them.
-- Schema only: no data changes.
CREATE INDEX crm_accounts_city_ward ON crm_accounts(city, ward);
CREATE INDEX crm_lead_records_city_ward ON crm_lead_records(city, ward);
