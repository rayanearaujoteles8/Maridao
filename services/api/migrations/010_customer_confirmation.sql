\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_code_hash text;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_code_salt text;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_code_expires_at timestamptz;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_code_attempts smallint NOT NULL DEFAULT 0 CHECK(completion_code_attempts BETWEEN 0 AND 5);
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_authorized_by uuid REFERENCES maridao.accounts(id);
CREATE TABLE IF NOT EXISTS maridao.request_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES maridao.service_requests(id),
 actor_account_id uuid REFERENCES maridao.accounts(id),
 actor_kind varchar(20) NOT NULL CHECK(actor_kind IN ('customer','provider','system','administration')),
 action varchar(60) NOT NULL,
 previous_status varchar(30),next_status varchar(30),reason varchar(1000) NOT NULL,
 related_request_id uuid REFERENCES maridao.service_requests(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS maridao.service_support(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES maridao.service_requests(id),
 customer_id uuid NOT NULL REFERENCES maridao.customer_profiles(account_id),
 reason varchar(30) NOT NULL CHECK(reason IN ('discordancia','nao_realizado')),
 description varchar(3000) NOT NULL CHECK(btrim(description)<>''),
 status varchar(20) NOT NULL DEFAULT 'Aberto' CHECK(status IN ('Aberto','Resolvido','Cancelado')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolution varchar(3000),resolved_at timestamptz,
 resolved_by varchar(150),
 CHECK((status='Aberto' AND resolved_at IS NULL) OR (status<>'Aberto' AND resolved_at IS NOT NULL AND resolution IS NOT NULL AND btrim(resolution)<>'' AND resolved_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS service_support_one_open_idx ON maridao.service_support(request_id) WHERE status='Aberto';
CREATE INDEX IF NOT EXISTS request_events_request_created_idx ON maridao.request_events(request_id,created_at,id);
REVOKE ALL ON maridao.request_events,maridao.service_support FROM PUBLIC;
GRANT SELECT,INSERT ON maridao.request_events,maridao.service_support TO maridao_api;
GRANT UPDATE(completion_code_hash,completion_code_salt,completion_code_expires_at,completion_code_attempts,completion_authorized_by) ON maridao.service_requests TO maridao_api;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selection_state_check;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_progress_check;
UPDATE maridao.service_requests SET status='Concluída' WHERE status=convert_from(convert_to('Concluída','UTF8'),'LATIN1');
ALTER TABLE maridao.service_requests ADD CONSTRAINT service_requests_status_check CHECK(status IN ('Aberta','Cancelada','Aceita','Em andamento','Concluída'));
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selection_state_check CHECK(
 (status='Aberta' AND selected_proposal_id IS NULL) OR status='Cancelada' OR
 (status IN ('Aceita','Em andamento','Concluída') AND selected_proposal_id IS NOT NULL));
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_progress_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_progress_check CHECK(
 (status IN ('Aberta','Aceita') AND started_at IS NULL AND completed_at IS NULL) OR
 (status='Cancelada' AND completed_at IS NULL) OR
 (status='Em andamento' AND started_at IS NOT NULL AND completed_at IS NULL) OR
 (status='Concluída' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at>=started_at));
CREATE OR REPLACE FUNCTION maridao.resolve_service_support(p_protocol uuid,p_decision text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_request uuid;v_status text;v_protocol_status text;v_selected uuid;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('resolver','cancelar') OR p_reason IS NULL OR length(btrim(p_reason))<1 OR length(p_reason)>1000 THEN
  RAISE EXCEPTION 'Informe decisao e justificativa de ate 1000 caracteres.';
 END IF;
 SELECT request_id INTO v_request FROM maridao.service_support WHERE id=p_protocol;
 IF v_request IS NULL THEN RAISE EXCEPTION 'Protocolo indisponivel.'; END IF;
 SELECT status,selected_proposal_id INTO v_status,v_selected FROM maridao.service_requests WHERE id=v_request FOR UPDATE;
 SELECT status INTO v_protocol_status FROM maridao.service_support WHERE id=p_protocol FOR UPDATE;
 IF v_protocol_status<>'Aberto' OR v_status<>'Em andamento' THEN RAISE EXCEPTION 'Protocolo ou atendimento nao permite esta decisao.'; END IF;
 UPDATE maridao.service_support SET status=CASE WHEN p_decision='cancelar' THEN 'Cancelado' ELSE 'Resolvido' END,
  resolution=btrim(p_reason),resolved_at=clock_timestamp(),resolved_by=session_user WHERE id=p_protocol;
 IF p_decision='cancelar' THEN
  UPDATE maridao.service_requests SET status='Cancelada',completion_code_hash=NULL,completion_code_salt=NULL,completion_code_expires_at=NULL WHERE id=v_request;
  UPDATE maridao.proposals SET status='Cancelada' WHERE id=v_selected AND request_id=v_request AND status='Aceita';
 END IF;
 INSERT INTO maridao.request_events(request_id,actor_kind,action,previous_status,next_status,reason)
 VALUES(v_request,'administration',CASE WHEN p_decision='cancelar' THEN 'support_cancelled' ELSE 'support_resolved' END,
 v_status,CASE WHEN p_decision='cancelar' THEN 'Cancelada' ELSE v_status END,session_user || ': ' || btrim(p_reason));
END;
$$;
REVOKE ALL ON FUNCTION maridao.resolve_service_support(uuid,text,text) FROM PUBLIC;

COMMIT;
\echo 'Confirmacao pelo cliente, protocolos e rastreabilidade habilitados.'
