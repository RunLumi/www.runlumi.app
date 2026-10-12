-- Expected win probability per opportunity, next to its expected contract
-- value (estimated_value_vnd). NULL means unknown and is never treated as 0.
ALTER TABLE crm_opportunities ADD COLUMN win_probability INTEGER CHECK (win_probability IS NULL OR (win_probability >= 0 AND win_probability <= 100));
CREATE INDEX crm_opportunities_owner_outcome ON crm_opportunities(owner_id, outcome);
