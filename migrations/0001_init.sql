-- 0001: Core schema for the IIE event backbone (PRD §9).
-- The events table is the Unified Event Log — the single source of truth.

CREATE TABLE IF NOT EXISTS events (
    event_id      TEXT PRIMARY KEY,
    case_id       TEXT NOT NULL,
    activity      TEXT NOT NULL,
    resource      TEXT NOT NULL,
    "timestamp"   TEXT NOT NULL,
    source_system TEXT NOT NULL CHECK (source_system IN ('CHATBOT', 'ATTENDANCE', 'LEAVE_WORKFLOW')),
    metadata      TEXT NOT NULL DEFAULT '{}',
    ingested_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_case_ts   ON events (case_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_events_ts        ON events ("timestamp");
CREATE INDEX IF NOT EXISTS idx_events_source_ts ON events (source_system, "timestamp");
CREATE INDEX IF NOT EXISTS idx_events_activity  ON events (activity);

CREATE TABLE IF NOT EXISTS departments (
    department_id    TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    head_employee_id TEXT
);

CREATE TABLE IF NOT EXISTS employees (
    employee_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    department_id TEXT NOT NULL REFERENCES departments (department_id),
    role          TEXT,
    email         TEXT,
    card_id       TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS attendance_records (
    record_id   TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees (employee_id),
    date        TEXT NOT NULL,
    clock_in    TEXT,
    clock_out   TEXT,
    status      TEXT NOT NULL DEFAULT 'present',
    UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    request_id   TEXT PRIMARY KEY,
    employee_id  TEXT NOT NULL REFERENCES employees (employee_id),
    type         TEXT NOT NULL,
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'submitted',
    current_step TEXT NOT NULL DEFAULT 'supervisor_review',
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
    transition_id TEXT PRIMARY KEY,
    request_id    TEXT NOT NULL REFERENCES leave_requests (request_id),
    from_step     TEXT NOT NULL,
    to_step       TEXT NOT NULL,
    actor_id      TEXT,
    "timestamp"   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transitions_request ON workflow_transitions (request_id, "timestamp");
