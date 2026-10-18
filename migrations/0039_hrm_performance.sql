-- Private performance cycles. No default review policy, rating scale or payroll effect.
CREATE TABLE hrm_performance_reviews (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES hrm_people(id),
 employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
 legal_entity TEXT NOT NULL,
 cycle_code TEXT NOT NULL CHECK(length(cycle_code) BETWEEN 1 AND 48),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 period_start TEXT NOT NULL, period_end TEXT NOT NULL CHECK(period_end>=period_start),
 due_on TEXT NOT NULL CHECK(due_on>=period_end),
 reviewer_user_id TEXT NOT NULL,
 objectives TEXT NOT NULL CHECK(length(objectives) BETWEEN 1 AND 4000),
 evidence_instructions TEXT NOT NULL CHECK(length(evidence_instructions) BETWEEN 1 AND 2000),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','self_submitted','assessed','published','responded','closed','cancelled')),
 self_assessment TEXT NOT NULL DEFAULT '', self_evidence TEXT NOT NULL DEFAULT '',
 assessment TEXT NOT NULL DEFAULT '', assessment_evidence TEXT NOT NULL DEFAULT '', development_plan TEXT NOT NULL DEFAULT '',
 employee_feedback TEXT NOT NULL DEFAULT '', acknowledged_at TEXT,
 assessed_by TEXT, assessed_at TEXT, published_by TEXT, published_at TEXT, closed_by TEXT, closed_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(state NOT IN ('self_submitted','assessed','published','responded','closed') OR (length(self_assessment)>0 AND length(self_evidence)>0)),
 CHECK(state NOT IN ('assessed','published','responded','closed') OR (length(assessment)>0 AND length(assessment_evidence)>0 AND length(development_plan)>0 AND assessed_by IS NOT NULL AND assessed_at IS NOT NULL)),
 CHECK(state NOT IN ('published','responded','closed') OR (published_by IS NOT NULL AND published_at IS NOT NULL AND published_by!=created_by AND published_by!=assessed_by)),
 CHECK(state NOT IN ('responded','closed') OR acknowledged_at IS NOT NULL),
 CHECK(state!='closed' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND closed_by!=created_by AND closed_by!=assessed_by))
);
CREATE UNIQUE INDEX hrm_performance_cycle ON hrm_performance_reviews(employment_id,cycle_code) WHERE state!='cancelled';
CREATE INDEX hrm_performance_reviewer ON hrm_performance_reviews(reviewer_user_id,state,due_on);
CREATE INDEX hrm_performance_person ON hrm_performance_reviews(person_id,period_end DESC,id);
CREATE TABLE hrm_performance_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 review_id TEXT NOT NULL REFERENCES hrm_performance_reviews(id),
 event_type TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('shared','staff')),
 revision INTEGER NOT NULL CHECK(revision>0),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(review_id,revision)
);
CREATE TRIGGER hrm_performance_events_no_update BEFORE UPDATE ON hrm_performance_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_events_no_delete BEFORE DELETE ON hrm_performance_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_no_delete BEFORE DELETE ON hrm_performance_reviews BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_update_guard BEFORE UPDATE ON hrm_performance_reviews BEGIN
 SELECT CASE WHEN NEW.revision!=OLD.revision+1 OR NEW.id!=OLD.id OR NEW.person_id!=OLD.person_id OR NEW.employment_id!=OLD.employment_id OR NEW.legal_entity!=OLD.legal_entity OR NEW.cycle_code!=OLD.cycle_code OR NEW.title!=OLD.title OR NEW.period_start!=OLD.period_start OR NEW.period_end!=OLD.period_end OR NEW.due_on!=OLD.due_on OR NEW.objectives!=OLD.objectives OR NEW.evidence_instructions!=OLD.evidence_instructions OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN NOT (
  (OLD.state='open' AND NEW.state IN ('open','self_submitted','cancelled')) OR
  (OLD.state='self_submitted' AND NEW.state IN ('self_submitted','assessed','cancelled')) OR
  (OLD.state='assessed' AND NEW.state IN ('self_submitted','published','cancelled')) OR
  (OLD.state='published' AND NEW.state='responded') OR
  (OLD.state='responded' AND NEW.state='closed')
 ) THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN OLD.state IN ('published','responded','closed') AND (
  NEW.reviewer_user_id!=OLD.reviewer_user_id OR NEW.self_assessment!=OLD.self_assessment OR NEW.self_evidence!=OLD.self_evidence OR NEW.assessment!=OLD.assessment OR NEW.assessment_evidence!=OLD.assessment_evidence OR NEW.development_plan!=OLD.development_plan OR NEW.assessed_by IS NOT OLD.assessed_by OR NEW.assessed_at IS NOT OLD.assessed_at OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at
 ) THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN OLD.state='responded' AND (NEW.employee_feedback!=OLD.employee_feedback OR NEW.acknowledged_at IS NOT OLD.acknowledged_at) THEN RAISE(ABORT,'immutable_history') END;
END;
