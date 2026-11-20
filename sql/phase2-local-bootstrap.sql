-- Local-only additive baseline for the existing phase2/src repositories.
-- REVIEW REQUIRED: no automatic execution at application startup.
-- Uses the SAME database as Phase 1. Does not modify Phase 1 tables or seed teams.
BEGIN;
SET LOCAL search_path=public;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND left(tablename,3)='p2_') THEN
    RAISE EXCEPTION 'Phase 2 tables already exist; reconcile schema before applying baseline';
  END IF;
END $$;

CREATE TABLE p2_season (
  id uuid PRIMARY KEY, label text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE p2_template_version (
  id text PRIMARY KEY, config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Metadata only. Sporting rules still require explicit approval in the existing UI.
INSERT INTO p2_template_version(id,config) VALUES
 ('pmyc-four-stage-v1','{"name":"PMYC 4 Stage","stages":4}'),
 ('knockout-v1','{"name":"ฟุตบอลแพ้คัดออก","stages":1}'),
 ('round-robin-v1','{"name":"ฟุตบอลพบกันหมด","stages":1}');
CREATE TABLE p2_event (
  id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES p2_season(id),
  template_version_id text NOT NULL REFERENCES p2_template_version(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  is_test boolean NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CLOSED','ARCHIVED')),
  config_snapshot jsonb NOT NULL, rule_version_id uuid,
  created_by text NOT NULL, request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(end_date>=start_date)
);
CREATE TABLE p2_event_division (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES p2_event(id),
  code text NOT NULL CHECK(code IN ('U14_BOY','U16_BOY','U18_BOY','U18_GIRL')),
  UNIQUE(event_id,code), UNIQUE(id,event_id)
);
CREATE TABLE p2_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES p2_event(id), actor_id text NOT NULL,
  action text NOT NULL, request_id uuid NOT NULL, new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX p2_audit_event_time ON p2_audit_log(event_id,created_at DESC);
CREATE TABLE p2_competition (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES p2_event(id), division_id uuid NOT NULL,
  stage integer NOT NULL CHECK(stage BETWEEN 1 AND 4), province text, district text, zone text,
  area_key text NOT NULL, status text NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  roster_revision_id uuid, draw_version_id uuid, qualification_revision_id uuid,
  created_by text NOT NULL, request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(division_id,event_id) REFERENCES p2_event_division(id,event_id),
  UNIQUE(event_id,division_id,stage,area_key),
  CHECK((stage=1 AND province IS NOT NULL AND district IS NOT NULL AND zone IS NULL)
     OR (stage=2 AND province IS NOT NULL AND district IS NULL AND zone IS NULL)
     OR (stage=3 AND province IS NULL AND district IS NULL AND zone IS NOT NULL)
     OR (stage=4 AND province IS NULL AND district IS NULL AND zone IS NULL))
);
CREATE TABLE p2_competition_assignment (
  competition_id uuid NOT NULL REFERENCES p2_competition(id), actor_id text NOT NULL,
  actor_role text NOT NULL CHECK(actor_role IN ('DOCUMENT_VERIFIER','SAT_OFFICER')),
  permissions jsonb NOT NULL CHECK(jsonb_typeof(permissions)='array'), active boolean NOT NULL,
  version integer NOT NULL CHECK(version>0), last_request_id uuid NOT NULL,
  last_request_hash text NOT NULL, updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(competition_id,actor_id,actor_role)
);
CREATE TABLE p2_roster_revision (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES p2_competition(id),
  version integer NOT NULL CHECK(version>0), teams jsonb NOT NULL CHECK(jsonb_typeof(teams)='array'),
  fingerprint text NOT NULL, locked boolean NOT NULL, request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL, actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_id,version), UNIQUE(id,competition_id)
);
CREATE TABLE p2_draw_version (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES p2_competition(id),
  roster_revision_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
  algorithm_version text NOT NULL, slots jsonb NOT NULL, fixtures jsonb NOT NULL,
  automatic_qualifiers jsonb NOT NULL, actor_id text NOT NULL, reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(roster_revision_id,competition_id) REFERENCES p2_roster_revision(id,competition_id),
  UNIQUE(competition_id,version), UNIQUE(id,competition_id)
);
CREATE TABLE p2_draw_publication (
  draw_id uuid PRIMARY KEY REFERENCES p2_draw_version(id), actor_id text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE p2_draw_request (
  request_id uuid PRIMARY KEY, request_hash text NOT NULL, draw_id uuid NOT NULL REFERENCES p2_draw_version(id)
);
CREATE TABLE p2_rule_version (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES p2_event(id),
  version integer NOT NULL CHECK(version>0), config jsonb NOT NULL,
  actor_id text NOT NULL, reason text NOT NULL, request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,version), UNIQUE(id,event_id)
);
CREATE TABLE p2_venue (
  id uuid PRIMARY KEY, name text NOT NULL, province text NOT NULL, district text NOT NULL,
  created_by text NOT NULL, request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX p2_venue_area_name ON p2_venue(province,district,lower(btrim(name)));
CREATE TABLE p2_platform_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL,
  action text NOT NULL, request_id uuid NOT NULL, new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE p2_match (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES p2_competition(id), draw_id uuid NOT NULL,
  number integer NOT NULL CHECK(number>0), round integer NOT NULL CHECK(round>0),
  side_a jsonb NOT NULL, side_b jsonb NOT NULL, venue_id uuid REFERENCES p2_venue(id),
  scheduled_start timestamptz, scheduled_end timestamptz, started_at timestamptz,
  state text NOT NULL DEFAULT 'UNSCHEDULED'
    CHECK(state IN ('UNSCHEDULED','SCHEDULED','IN_PROGRESS','COMPLETED','POSTPONED','CANCELLED')),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0), confirmed_result_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(draw_id,competition_id) REFERENCES p2_draw_version(id,competition_id),
  UNIQUE(draw_id,number), CHECK(scheduled_end>scheduled_start)
);
CREATE TABLE p2_match_change (
  id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES p2_match(id), version integer NOT NULL,
  operation text NOT NULL, reason text NOT NULL, actor_id text NOT NULL, snapshot jsonb NOT NULL,
  request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(match_id,version)
);
CREATE TABLE p2_lineup_revision (
  id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES p2_match(id), team_id text NOT NULL,
  version integer NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN ('DRAFT','CONFIRMED')),
  roster_revision_id uuid NOT NULL REFERENCES p2_roster_revision(id),
  rule_version_id uuid NOT NULL REFERENCES p2_rule_version(id), players jsonb NOT NULL,
  actor_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id,team_id,version)
);
CREATE TABLE p2_result_revision (
  id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES p2_match(id),
  version integer NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN ('DRAFT','CONFIRMED')),
  rule_version_id uuid NOT NULL REFERENCES p2_rule_version(id), result jsonb NOT NULL,
  actor_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id,version), UNIQUE(id,match_id)
);
CREATE TABLE p2_qualification_revision (
  id uuid PRIMARY KEY, competition_id uuid NOT NULL REFERENCES p2_competition(id),
  draw_id uuid NOT NULL, result_id uuid NOT NULL REFERENCES p2_result_revision(id), teams jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(draw_id,competition_id) REFERENCES p2_draw_version(id,competition_id),
  UNIQUE(id,competition_id)
);
CREATE TABLE p2_advancement_source (
  roster_revision_id uuid NOT NULL, target_competition_id uuid NOT NULL,
  source_competition_id uuid NOT NULL REFERENCES p2_competition(id),
  event_id uuid NOT NULL REFERENCES p2_event(id), division_id uuid NOT NULL,
  source_draw_id uuid NOT NULL, qualification_revision_id uuid NOT NULL,
  source_team_id text NOT NULL, rank integer NOT NULL CHECK(rank>0),
  FOREIGN KEY(roster_revision_id,target_competition_id) REFERENCES p2_roster_revision(id,competition_id),
  FOREIGN KEY(division_id,event_id) REFERENCES p2_event_division(id,event_id),
  FOREIGN KEY(source_draw_id,source_competition_id) REFERENCES p2_draw_version(id,competition_id),
  FOREIGN KEY(qualification_revision_id,source_competition_id) REFERENCES p2_qualification_revision(id,competition_id),
  PRIMARY KEY(roster_revision_id,source_team_id), UNIQUE(roster_revision_id,source_competition_id,rank)
);
CREATE TABLE p2_advancement_request (
  request_id uuid PRIMARY KEY, request_hash text NOT NULL,
  roster_revision_id uuid NOT NULL REFERENCES p2_roster_revision(id)
);
ALTER TABLE p2_event ADD FOREIGN KEY(rule_version_id,id) REFERENCES p2_rule_version(id,event_id);
ALTER TABLE p2_competition ADD FOREIGN KEY(roster_revision_id,id) REFERENCES p2_roster_revision(id,competition_id);
ALTER TABLE p2_competition ADD FOREIGN KEY(draw_version_id,id) REFERENCES p2_draw_version(id,competition_id);
ALTER TABLE p2_competition ADD FOREIGN KEY(qualification_revision_id,id) REFERENCES p2_qualification_revision(id,competition_id);
ALTER TABLE p2_match ADD FOREIGN KEY(confirmed_result_id,id) REFERENCES p2_result_revision(id,match_id);
COMMIT;
