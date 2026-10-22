\set ON_ERROR_STOP on
\connect maridao
BEGIN;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT service_requests_status_check
 CHECK (status IN ('Aberta','Aceita','Em andamento','Concluída'));
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selection_state_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selection_state_check
 CHECK ((status='Aberta' AND selected_proposal_id IS NULL) OR (status IN ('Aceita','Em andamento','Concluída') AND selected_proposal_id IS NOT NULL));
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_progress_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_progress_check CHECK (
 (status IN ('Aberta','Aceita') AND started_at IS NULL AND completed_at IS NULL) OR
 (status='Em andamento' AND started_at IS NOT NULL AND completed_at IS NULL) OR
 (status='Concluída' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at>=started_at));
GRANT UPDATE(started_at,completed_at) ON maridao.service_requests TO maridao_api;
COMMIT;
\echo 'Andamento e conclusao de atendimentos habilitados com sucesso.'
