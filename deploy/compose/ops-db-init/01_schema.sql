-- Ops-DB-Schema für das NextGen-CICD Grafana-Dashboard.
-- Wird beim ersten Start des ops-db-Containers automatisch ausgeführt
-- (docker-entrypoint-initdb.d). Befüllt wird es fail-safe über
-- deploy/scripts/ops-event.sh aus der Pipeline.

-- Deployment-Events (deploy / promote / rollback / failed).
-- status-Werte: 'deployed' | 'promoted' | 'rolled_back' | 'failed'
-- Bewusst KEIN CHECK-Constraint auf status: unbekannte Werte sollen ein
-- Event nicht verwerfen (ops-event.sh ist fail-safe, das Dashboard darf nie
-- ein Deployment brechen).
CREATE TABLE deployments (
  id serial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL,
  image_tag text NOT NULL,
  git_sha text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT '',
  status text NOT NULL,
  duration_seconds int,
  run_url text NOT NULL DEFAULT ''
);

-- Testlauf-Ergebnisse je Gate (inkl. flaky-Zahl — Kern des Flaky-Trends).
CREATE TABLE test_runs (
  id serial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL,
  suite text NOT NULL,
  total int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  flaky int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  run_url text NOT NULL DEFAULT ''
);

-- Panels sortieren/filtern nach (env, time desc).
CREATE INDEX idx_deployments_env_time ON deployments (env, time DESC);
CREATE INDEX idx_test_runs_env_time ON test_runs (env, time DESC);
