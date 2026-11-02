-- Ward, district and city on companies and leads, for the CRM stats filters.
-- Additive only: existing rows keep '' until an editor saves them or an admin
-- runs "Fill areas from addresses" on /crm/stats, which reads only explicitly
-- marked parts (Phường/Quận/known city names) and never guesses.
ALTER TABLE crm_accounts ADD COLUMN ward TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_accounts ADD COLUMN district TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_accounts ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_lead_records ADD COLUMN ward TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_lead_records ADD COLUMN district TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_lead_records ADD COLUMN city TEXT NOT NULL DEFAULT '';
CREATE INDEX crm_accounts_area ON crm_accounts(city, district, ward);
CREATE INDEX crm_lead_records_area ON crm_lead_records(city, district, ward);
