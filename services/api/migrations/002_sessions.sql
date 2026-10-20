\set ON_ERROR_STOP on
\connect maridao
BEGIN;
CREATE TABLE maridao.sessions (
    token_hash char(64) PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    account_id uuid NOT NULL REFERENCES maridao.accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);
CREATE INDEX sessions_account_idx ON maridao.sessions(account_id);
CREATE INDEX sessions_expiry_idx ON maridao.sessions(expires_at);
REVOKE ALL ON maridao.sessions FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON maridao.sessions TO maridao_api;
COMMIT;
\echo 'Tabela de sessoes criada com sucesso.'
