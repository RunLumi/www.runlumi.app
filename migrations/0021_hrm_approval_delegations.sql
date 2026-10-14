CREATE TABLE hrm_approval_delegations (
  id TEXT PRIMARY KEY,
  delegator_user_id TEXT NOT NULL,
  delegate_user_id TEXT NOT NULL,
  approval_kind TEXT NOT NULL CHECK (approval_kind IN ('time','leave')),
  effective_from TEXT NOT NULL CHECK (date(effective_from)=effective_from),
  effective_to TEXT NOT NULL CHECK (date(effective_to)=effective_to AND effective_to>=effective_from),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_by TEXT,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (delegator_user_id!=delegate_user_id),
  CHECK ((state='active' AND revoked_by IS NULL AND revoked_at IS NULL) OR (state='revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE INDEX hrm_approval_delegations_active ON hrm_approval_delegations(approval_kind,delegator_user_id,delegate_user_id,state,effective_from,effective_to);

CREATE TABLE hrm_approval_delegation_history (
  id TEXT PRIMARY KEY,
  delegation_id TEXT NOT NULL REFERENCES hrm_approval_delegations(id),
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(delegation_id,version)
);
CREATE TRIGGER hrm_approval_delegation_created AFTER INSERT ON hrm_approval_delegations BEGIN
  INSERT INTO hrm_approval_delegation_history(id,delegation_id,version,snapshot_json,actor_id,created_at)
  VALUES('approval_delegation_history_'||NEW.id||'_1',NEW.id,NEW.version,json_object('delegator_user_id',NEW.delegator_user_id,'delegate_user_id',NEW.delegate_user_id,'approval_kind',NEW.approval_kind,'effective_from',NEW.effective_from,'effective_to',NEW.effective_to,'reason',NEW.reason,'state',NEW.state,'created_by',NEW.created_by,'created_at',NEW.created_at,'revoked_by',NEW.revoked_by,'revoked_at',NEW.revoked_at),NEW.actor_id,NEW.updated_at);
END;
CREATE TRIGGER hrm_approval_delegation_revoke_only BEFORE UPDATE ON hrm_approval_delegations WHEN
  OLD.state!='active' OR NEW.state!='revoked' OR NEW.version!=OLD.version+1 OR
  NEW.id IS NOT OLD.id OR NEW.delegator_user_id IS NOT OLD.delegator_user_id OR NEW.delegate_user_id IS NOT OLD.delegate_user_id OR
  NEW.approval_kind IS NOT OLD.approval_kind OR NEW.effective_from IS NOT OLD.effective_from OR NEW.effective_to IS NOT OLD.effective_to OR
  NEW.reason IS NOT OLD.reason OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR
  NEW.revoked_by IS NULL OR NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_approval_delegation_revoked AFTER UPDATE ON hrm_approval_delegations BEGIN
  INSERT INTO hrm_approval_delegation_history(id,delegation_id,version,snapshot_json,actor_id,created_at)
  VALUES('approval_delegation_history_'||NEW.id||'_'||NEW.version,NEW.id,NEW.version,json_object('delegator_user_id',NEW.delegator_user_id,'delegate_user_id',NEW.delegate_user_id,'approval_kind',NEW.approval_kind,'effective_from',NEW.effective_from,'effective_to',NEW.effective_to,'reason',NEW.reason,'state',NEW.state,'created_by',NEW.created_by,'created_at',NEW.created_at,'revoked_by',NEW.revoked_by,'revoked_at',NEW.revoked_at),NEW.actor_id,NEW.updated_at);
END;
CREATE TRIGGER hrm_approval_delegation_no_delete BEFORE DELETE ON hrm_approval_delegations BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
