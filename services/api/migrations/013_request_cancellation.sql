\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- RF04.4 / UC04.4: o cancelamento usa as colunas e o registro de eventos (request_events) já existentes.
-- Um protocolo de suporte aberto é encerrado junto com o pedido cancelado; a API passa a poder registrar esse encerramento.
GRANT UPDATE(status,resolution,resolved_at,resolved_by) ON maridao.service_support TO maridao_api;

-- RF13.3: mesma função da migração 011, com um único ajuste (marcado com 013) para não avisar duas vezes o mesmo cancelamento.
CREATE OR REPLACE FUNCTION maridao.notify_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record; recipient uuid; label text;
BEGIN
 IF TG_TABLE_NAME='service_requests' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT provider_id INTO recipient FROM maridao.proposals WHERE id=NEW.selected_proposal_id;
  INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.customer_id,NEW.id,'Pedido atualizado: '||NEW.status);
  IF recipient IS NOT NULL THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(recipient,NEW.id,'Atendimento atualizado: '||NEW.status); END IF;
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
\echo 'Cancelamento de solicitacoes habilitado.'
