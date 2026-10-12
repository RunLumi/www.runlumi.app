-- Companies and contacts get an owner (the person who manages them), so they
-- can exist before any opportunity and be listed per person. NULL = not yet
-- assigned. Existing rows take the owner of their most recent opportunity,
-- which keeps every current owner able to see what they see today.

ALTER TABLE crm_accounts ADD COLUMN owner_id TEXT;
ALTER TABLE crm_contacts ADD COLUMN owner_id TEXT;
CREATE INDEX crm_accounts_owner ON crm_accounts(owner_id);
CREATE INDEX crm_contacts_owner ON crm_contacts(owner_id);

UPDATE crm_contacts SET owner_id = COALESCE(
  (SELECT o.owner_id FROM crm_opportunities o WHERE o.primary_contact_id = crm_contacts.id AND o.owner_id IS NOT NULL ORDER BY o.updated_at DESC LIMIT 1),
  (SELECT o.owner_id FROM crm_opportunities o WHERE o.account_id = crm_contacts.account_id AND o.owner_id IS NOT NULL ORDER BY o.updated_at DESC LIMIT 1)
);

UPDATE crm_accounts SET owner_id =
  (SELECT o.owner_id FROM crm_opportunities o WHERE o.account_id = crm_accounts.id AND o.owner_id IS NOT NULL ORDER BY o.updated_at DESC LIMIT 1);
