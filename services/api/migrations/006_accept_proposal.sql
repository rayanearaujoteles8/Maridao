\set ON_ERROR_STOP on
\connect maridao
BEGIN;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS selected_proposal_id uuid;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT service_requests_status_check CHECK (status IN ('Aberta','Aceita'));
CREATE UNIQUE INDEX IF NOT EXISTS proposals_one_accepted_idx ON maridao.proposals(request_id) WHERE status='Aceita';
CREATE UNIQUE INDEX IF NOT EXISTS proposals_request_id_id_idx ON maridao.proposals(request_id,id);
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selected_proposal_fk;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selected_proposal_fk
 FOREIGN KEY (id,selected_proposal_id) REFERENCES maridao.proposals(request_id,id) ON DELETE RESTRICT;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selection_state_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selection_state_check
 CHECK ((status='Aberta' AND selected_proposal_id IS NULL) OR (status='Aceita' AND selected_proposal_id IS NOT NULL));
GRANT UPDATE(status,selected_proposal_id) ON maridao.service_requests TO maridao_api;
GRANT UPDATE(status) ON maridao.proposals TO maridao_api;
COMMIT;
\echo 'Aceite de propostas habilitado com sucesso.'
