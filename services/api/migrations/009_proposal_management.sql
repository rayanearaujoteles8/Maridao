\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
ALTER TABLE maridao.proposals ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE maridao.proposals ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE maridao.proposals ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
GRANT UPDATE(amount,description,estimated_duration,valid_until,version,updated_at,withdrawn_at) ON maridao.proposals TO maridao_api;
COMMIT;
\echo 'Edicao e retirada de propostas habilitadas com sucesso.'
