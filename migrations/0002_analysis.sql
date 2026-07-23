-- 0002: Process intelligence output tables (PRD §9).
-- Results are appended per mining run; readers select the latest run.

CREATE TABLE IF NOT EXISTS process_models (
    model_id     TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    graph_json   TEXT NOT NULL,
    variant_json TEXT NOT NULL DEFAULT '[]',
    case_count   INTEGER NOT NULL DEFAULT 0,
    event_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_models_source ON process_models (source, created_at);

CREATE TABLE IF NOT EXISTS bottlenecks (
    id            TEXT PRIMARY KEY,
    activity_pair TEXT NOT NULL,
    source        TEXT NOT NULL,
    count         INTEGER NOT NULL,
    mean_ms       REAL NOT NULL,
    median_ms     REAL NOT NULL,
    p95_ms        REAL NOT NULL,
    max_ms        REAL NOT NULL,
    flagged       INTEGER NOT NULL DEFAULT 0,
    period        TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_bottlenecks_period ON bottlenecks (period);

CREATE TABLE IF NOT EXISTS conformance_results (
    id             TEXT PRIMARY KEY,
    case_id        TEXT NOT NULL,
    deviation_type TEXT NOT NULL,
    description    TEXT NOT NULL,
    score          REAL NOT NULL,
    detected_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_conformance_run ON conformance_results (detected_at);
