-- ============================================================================
--  Cyber City Roleplay — Ministry of Interior Management System
--  PostgreSQL Schema (for migrating from the demo storage layer to a real
--  Node.js/NestJS + PostgreSQL backend)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- ROLES / PERMISSIONS
-- ---------------------------------------------------------------------------
CREATE TYPE role_enum AS ENUM (
  'soldier', 'recruiter', 'hr', 'badges_admin',
  'unit_commander', 'high_command', 'developer'
);

CREATE TYPE status_enum AS ENUM ('active', 'leave', 'resigned', 'terminated');
CREATE TYPE request_status_enum AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE circular_type_enum AS ENUM ('general', 'unit');
CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- UNITS
-- ---------------------------------------------------------------------------
CREATE TABLE units (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar         VARCHAR(120) NOT NULL,
  name_en         VARCHAR(120) NOT NULL,
  commander_id    UUID,               -- FK to users, added after users table
  deputy_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- USERS / PERSONNEL
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username           VARCHAR(60)  UNIQUE NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,          -- bcrypt/argon2 hash
  role               role_enum NOT NULL DEFAULT 'soldier',
  full_name          VARCHAR(160) NOT NULL,
  rank_ar            VARCHAR(80)  NOT NULL,
  rank_en            VARCHAR(80)  NOT NULL,
  unit_id            UUID REFERENCES units(id) ON DELETE SET NULL,
  military_number    VARCHAR(20)  UNIQUE NOT NULL,
  join_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  last_promotion     DATE,
  promotions_count   INT NOT NULL DEFAULT 0,
  status             status_enum NOT NULL DEFAULT 'active',
  discord            VARCHAR(80),
  steam_id           VARCHAR(60),
  fivem_identifier    VARCHAR(60),
  avatar_url         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE units ADD CONSTRAINT fk_units_commander FOREIGN KEY (commander_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE units ADD CONSTRAINT fk_units_deputy     FOREIGN KEY (deputy_id)    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_users_unit   ON users(unit_id);
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- ---------------------------------------------------------------------------
-- BADGES (الونجات) & AWARDS
-- ---------------------------------------------------------------------------
CREATE TABLE badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar     VARCHAR(100) NOT NULL,
  name_en     VARCHAR(100) NOT NULL,
  desc_ar     TEXT,
  desc_en     TEXT,
  icon        VARCHAR(20),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id    UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_by  UUID REFERENCES users(id),
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- PROMOTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE promotions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_rank_ar VARCHAR(80),
  from_rank_en VARCHAR(80),
  to_rank_ar   VARCHAR(80) NOT NULL,
  to_rank_en   VARCHAR(80) NOT NULL,
  reason_ar    TEXT,
  reason_en    TEXT,
  promoted_by  UUID REFERENCES users(id),
  promoted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_promotions_user ON promotions(user_id);

-- ---------------------------------------------------------------------------
-- PENALTIES / WARNINGS
-- ---------------------------------------------------------------------------
CREATE TABLE penalties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_ar     VARCHAR(80) NOT NULL,   -- verbal/written warning, deduction, suspension
  type_en     VARCHAR(80) NOT NULL,
  reason_ar   TEXT,
  reason_en   TEXT,
  issued_by   UUID REFERENCES users(id),
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_penalties_user ON penalties(user_id);

-- ---------------------------------------------------------------------------
-- LEAVE REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE leave_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_ar       VARCHAR(80) NOT NULL,
  type_en       VARCHAR(80) NOT NULL,
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  reason_ar     TEXT,
  reason_en     TEXT,
  status        request_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leaves_user ON leave_requests(user_id);
CREATE INDEX idx_leaves_status ON leave_requests(status);

-- ---------------------------------------------------------------------------
-- RESIGNATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE resignations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT,
  attachments   TEXT,
  status        request_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resignations_user ON resignations(user_id);

-- ---------------------------------------------------------------------------
-- CIRCULARS (التعميمات)
-- ---------------------------------------------------------------------------
CREATE TABLE circulars (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_ar     VARCHAR(200) NOT NULL,
  title_en     VARCHAR(200) NOT NULL,
  body_ar      TEXT,
  body_en      TEXT,
  type         circular_type_enum NOT NULL DEFAULT 'general',
  unit_id      UUID REFERENCES units(id),
  target_rank  VARCHAR(80),
  priority     priority_enum NOT NULL DEFAULT 'medium',
  attachments  TEXT,
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_circulars_unit ON circulars(unit_id);
CREATE INDEX idx_circulars_type ON circulars(type);

-- ---------------------------------------------------------------------------
-- AUDIT LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id     UUID REFERENCES users(id),
  actor_name   VARCHAR(160),
  actor_rank   VARCHAR(80),
  action       VARCHAR(100) NOT NULL,   -- e.g. login, hire_member, promotion...
  old_data     JSONB,
  new_data     JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor  ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_date   ON audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- SESSIONS (JWT refresh-token tracking, optional)
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================================================
--  ERD (text form — relationships)
-- ============================================================================
-- units (1) ───< (N) users                [users.unit_id -> units.id]
-- users (1) ───< (N) units (commander)     [units.commander_id -> users.id]
-- users (1) ───< (N) promotions            [promotions.user_id -> users.id]
-- users (1) ───< (N) penalties             [penalties.user_id -> users.id]
-- users (1) ───< (N) leave_requests        [leave_requests.user_id -> users.id]
-- users (1) ───< (N) resignations          [resignations.user_id -> users.id]
-- users (1) ───< (N) user_badges >──── (1) badges     [many-to-many via user_badges]
-- units (1) ───< (N) circulars             [circulars.unit_id -> units.id]
-- users (1) ───< (N) circulars (publisher) [circulars.published_by -> users.id]
-- users (1) ───< (N) audit_logs            [audit_logs.actor_id -> users.id]
-- users (1) ───< (N) sessions               [sessions.user_id -> users.id]
-- ============================================================================
