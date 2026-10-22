\set ON_ERROR_STOP on
\connect maridao
BEGIN;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT service_requests_status_check CHECK(status IN ('Aberta','Cancelada','Aceita','Em andamento','Concluída'));
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selection_state_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selection_state_check CHECK((status IN ('Aberta','Cancelada') AND selected_proposal_id IS NULL) OR (status IN ('Aceita','Em andamento','Concluída') AND selected_proposal_id IS NOT NULL));
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_progress_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_progress_check CHECK((status IN ('Aberta','Cancelada','Aceita') AND started_at IS NULL AND completed_at IS NULL) OR (status='Em andamento' AND started_at IS NOT NULL AND completed_at IS NULL) OR (status='Concluída' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at>=started_at));
ALTER TABLE maridao.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE maridao.proposals ADD CONSTRAINT proposals_status_check CHECK(status IN ('Pendente','Cancelada','Aceita','Não selecionada','Retirada'));
COMMIT;
\echo 'Substituicao de pedidos abertos habilitada com sucesso.'
