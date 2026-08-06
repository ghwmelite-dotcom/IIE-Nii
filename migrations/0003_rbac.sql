-- migrations/0003_rbac.sql
-- Milestone A: identity, RBAC & audit.

CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    employee_id   TEXT REFERENCES employees (employee_id),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
    role_id     TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id    TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    role_id    TEXT NOT NULL REFERENCES roles (role_id),
    scope_type TEXT NOT NULL DEFAULT '',
    scope_id   TEXT NOT NULL DEFAULT '',
    granted_by TEXT,
    granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, role_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id            TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_email   TEXT,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    detail_json   TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);

INSERT INTO roles (role_id, name, description) VALUES
  ('employee','Employee','Self-service leave, attendance and chatbot'),
  ('hr_admin','HR Administrator','Attendance & leave across all staff, org directory'),
  ('process_analyst','Process Analyst','Process Intelligence and event traces'),
  ('executive','Executive / Management','Decision Support and reports'),
  ('system_admin','System Administrator','User, role, config and audit administration')
ON CONFLICT (role_id) DO NOTHING;
