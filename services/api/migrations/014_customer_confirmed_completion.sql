\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- RF07.3 / RF07.4 (UC07.3, UC07.4): o prestador registra a conclusão ("Aguardando confirmação") e o cliente confirma ou contesta.
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_reported_at timestamptz;
ALTER TABLE maridao.service_requests ADD COLUMN IF NOT EXISTS completion_confirmed_by varchar(10);
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_selection_state_check;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_progress_check;
ALTER TABLE maridao.service_requests DROP CONSTRAINT IF EXISTS requests_completion_confirmation_check;
ALTER TABLE maridao.service_requests ADD CONSTRAINT service_requests_status_check CHECK(status IN ('Aberta','Cancelada','Aceita','Em andamento','Aguardando confirmação','Concluída'));
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_selection_state_check CHECK(
 (status='Aberta' AND selected_proposal_id IS NULL) OR status='Cancelada' OR
 (status IN ('Aceita','Em andamento','Aguardando confirmação','Concluída') AND selected_proposal_id IS NOT NULL));
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_progress_check CHECK(
 (status IN ('Aberta','Aceita') AND started_at IS NULL AND completed_at IS NULL AND completion_reported_at IS NULL) OR
 (status='Cancelada' AND completed_at IS NULL) OR
 (status='Em andamento' AND started_at IS NOT NULL AND completed_at IS NULL AND completion_reported_at IS NULL) OR
 (status='Aguardando confirmação' AND started_at IS NOT NULL AND completed_at IS NULL AND completion_reported_at IS NOT NULL AND completion_reported_at>=started_at) OR
 (status='Concluída' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at>=started_at AND (completion_reported_at IS NULL OR completed_at>=completion_reported_at)));
ALTER TABLE maridao.service_requests ADD CONSTRAINT requests_completion_confirmation_check CHECK(
 completion_confirmed_by IS NULL OR (status='Concluída' AND completion_confirmed_by IN ('customer','system') AND completion_reported_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS requests_awaiting_confirmation_idx ON maridao.service_requests(completion_reported_at) WHERE status='Aguardando confirmação';
GRANT UPDATE(completion_reported_at,completion_confirmed_by) ON maridao.service_requests TO maridao_api;

-- O código de quatro dígitos foi aposentado. As colunas ficam (nenhum dado é apagado junto com elas): o resumo, o salt e a
-- validade eram segredos de dez minutos e são zerados; completion_authorized_by e completion_code_attempts guardam o que
-- aconteceu no fluxo antigo. A API deixa de poder escrever nelas.
UPDATE maridao.service_requests SET completion_code_hash=NULL,completion_code_salt=NULL,completion_code_expires_at=NULL
 WHERE completion_code_hash IS NOT NULL OR completion_code_salt IS NOT NULL OR completion_code_expires_at IS NOT NULL;
REVOKE UPDATE(completion_code_hash,completion_code_salt,completion_code_expires_at,completion_code_attempts,completion_authorized_by) ON maridao.service_requests FROM maridao_api;
COMMENT ON COLUMN maridao.service_requests.completion_code_hash IS 'Aposentada na 014 (código de quatro dígitos). Sempre nula.';
COMMENT ON COLUMN maridao.service_requests.completion_code_salt IS 'Aposentada na 014 (código de quatro dígitos). Sempre nula.';
COMMENT ON COLUMN maridao.service_requests.completion_code_expires_at IS 'Aposentada na 014 (código de quatro dígitos). Sempre nula.';
COMMENT ON COLUMN maridao.service_requests.completion_code_attempts IS 'Aposentada na 014. Mantida só como registro do fluxo antigo.';
COMMENT ON COLUMN maridao.service_requests.completion_authorized_by IS 'Aposentada na 014. Mantida só como registro do fluxo antigo.';

-- Protocolo de suporte: fica para "serviço não realizado" antes do início. Mesma função da 010, sem tocar no código aposentado.
-- "Em andamento" continua aceito apenas para decidir protocolos abertos antes desta migração.
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
 IF v_protocol_status<>'Aberto' OR v_status NOT IN ('Aceita','Em andamento') THEN RAISE EXCEPTION 'Protocolo ou atendimento nao permite esta decisao.'; END IF;
 UPDATE maridao.service_support SET status=CASE WHEN p_decision='cancelar' THEN 'Cancelado' ELSE 'Resolvido' END,
  resolution=btrim(p_reason),resolved_at=clock_timestamp(),resolved_by=session_user WHERE id=p_protocol;
 IF p_decision='cancelar' THEN
  UPDATE maridao.service_requests SET status='Cancelada' WHERE id=v_request;
  UPDATE maridao.proposals SET status='Cancelada' WHERE id=v_selected AND request_id=v_request AND status='Aceita';
 END IF;
 INSERT INTO maridao.request_events(request_id,actor_kind,action,previous_status,next_status,reason)
 VALUES(v_request,'administration',CASE WHEN p_decision='cancelar' THEN 'support_cancelled' ELSE 'support_resolved' END,
 v_status,CASE WHEN p_decision='cancelar' THEN 'Cancelada' ELSE v_status END,session_user || ': ' || btrim(p_reason));
END;
$$;
REVOKE ALL ON FUNCTION maridao.resolve_service_support(uuid,text,text) FROM PUBLIC;

-- RF13.3: mesma função da 013, com os avisos próprios da conclusão (marcados com 014). Continua um aviso por pessoa e por mudança.
CREATE OR REPLACE FUNCTION maridao.notify_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record; recipient uuid; label text; customer_label text; provider_label text;
BEGIN
 IF TG_TABLE_NAME='service_requests' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT provider_id INTO recipient FROM maridao.proposals WHERE id=NEW.selected_proposal_id;
  customer_label:='Pedido atualizado: '||NEW.status; provider_label:='Atendimento atualizado: '||NEW.status;
  -- 014: conclusão registrada, contestada, confirmada pelo cliente ou confirmada pelo sistema.
  IF OLD.status='Em andamento' AND NEW.status='Aguardando confirmação' THEN customer_label:='Conclusão registrada pelo prestador: confirme ou conteste';
  ELSIF OLD.status='Aguardando confirmação' AND NEW.status='Em andamento' THEN provider_label:='Conclusão contestada pelo cliente: veja o motivo';
  ELSIF OLD.status='Aguardando confirmação' AND NEW.status='Concluída' AND NEW.completion_confirmed_by='system' THEN
   customer_label:='Conclusão confirmada automaticamente: o prazo de resposta terminou'; provider_label:=customer_label;
  ELSIF OLD.status='Aguardando confirmação' AND NEW.status='Concluída' THEN provider_label:='Conclusão confirmada pelo cliente';
  END IF;
  INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.customer_id,NEW.id,customer_label);
  IF recipient IS NOT NULL THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(recipient,NEW.id,provider_label); END IF;
 ELSE
  SELECT s.customer_id,p.provider_id,s.status AS request_status,s.selected_proposal_id INTO r FROM maridao.service_requests s LEFT JOIN maridao.proposals p ON p.id=s.selected_proposal_id WHERE s.id=NEW.request_id;
  IF TG_TABLE_NAME='proposals' THEN
   IF TG_OP='INSERT' THEN label:='Nova proposta recebida';
   ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 013: quando o pedido é cancelado, cliente e prestador escolhido já foram avisados pela mudança do pedido.
    IF NEW.status='Cancelada' AND r.request_status='Cancelada' AND r.selected_proposal_id=NEW.id THEN RETURN NEW; END IF;
    label:='Proposta atualizada: '||NEW.status;
   ELSIF NEW.version IS DISTINCT FROM OLD.version THEN label:='Proposta editada'; ELSE RETURN NEW; END IF;
   INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(r.customer_id,NEW.request_id,label);
   IF TG_OP='UPDATE' THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.provider_id,NEW.request_id,label); END IF;
  ELSIF TG_TABLE_NAME='chat_messages' THEN
   recipient:=CASE WHEN NEW.sender_id=r.customer_id THEN r.provider_id ELSE r.customer_id END;
   IF recipient IS NOT NULL THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(recipient,NEW.request_id,'Nova mensagem no atendimento'); END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.notify_workflow() FROM PUBLIC;
COMMIT;
\echo 'Conclusao confirmada pelo cliente habilitada; codigo de quatro digitos aposentado.'
