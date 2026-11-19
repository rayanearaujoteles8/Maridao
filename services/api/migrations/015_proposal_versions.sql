\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- RF05.2 / RN04: a proposta pendente cuja validade passou fica gravada como "Expirada".
-- Nenhuma migração de 009 a 014 (as que o activate_team.sql reaplica) redefine este CHECK; a 008, que o define, já não é reaplicável desde a 014.
ALTER TABLE maridao.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE maridao.proposals ADD CONSTRAINT proposals_status_check CHECK(status IN ('Pendente','Expirada','Aceita','Não selecionada','Retirada','Cancelada'));
CREATE INDEX IF NOT EXISTS proposals_pending_validity_idx ON maridao.proposals(valid_until) WHERE status='Pendente';

-- RF05.3 / RN02 (UC05.3, UC06.1, UC09.3): a linha de maridao.proposals continua sendo a versão vigente (mesmo id, version+1 a cada reenvio);
-- cada reenvio guarda aqui a fotografia da versão anterior, sempre "Substituída". A API só lê e insere: o histórico não é alterado nem apagado.
-- Propostas editadas antes desta migração (version > 1) não tiveram as versões antigas guardadas; nada é inventado para elas.
CREATE TABLE IF NOT EXISTS maridao.proposal_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposal_id uuid NOT NULL REFERENCES maridao.proposals(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 amount numeric(8,2) NOT NULL CHECK(amount>0 AND amount<=999999.99),
 description varchar(3000) NOT NULL CHECK(btrim(description)<>''),
 estimated_duration varchar(200) NOT NULL CHECK(btrim(estimated_duration)<>''),
 valid_until date NOT NULL,
 status varchar(30) NOT NULL DEFAULT 'Substituída' CHECK(status='Substituída'),
 -- Status que a versão tinha no momento do reenvio (RN02: só "Pendente" ou "Expirada" podem ser reenviadas).
 status_before varchar(30) NOT NULL CHECK(status_before IN ('Pendente','Expirada')),
 sent_at timestamptz NOT NULL,
 replaced_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(replaced_at>=sent_at),
 UNIQUE(proposal_id,version)
);
REVOKE ALL ON maridao.proposal_versions FROM PUBLIC;
GRANT SELECT,INSERT ON maridao.proposal_versions TO maridao_api;

-- RF13: mesma função da 014 (as marcas 013 e 014 continuam), com os avisos do reenvio e da expiração (marcados com 015).
-- Continua um aviso por pessoa e por mudança.
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
   -- 015: reenvio (RF13.1). Só o cliente é avisado: o prestador é quem reenviou. Vale também para a "Expirada" que volta a "Pendente".
   ELSIF NEW.version IS DISTINCT FROM OLD.version AND NEW.status='Pendente' THEN
    INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(r.customer_id,NEW.request_id,'Proposta reenviada: confira os novos dados');
    RETURN NEW;
   ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 013: quando o pedido é cancelado, cliente e prestador escolhido já foram avisados pela mudança do pedido.
    IF NEW.status='Cancelada' AND r.request_status='Cancelada' AND r.selected_proposal_id=NEW.id THEN RETURN NEW; END IF;
    -- 015: expiração (RN04). Só o prestador é avisado; o cliente vê a proposta marcada na lista.
    IF NEW.status='Expirada' THEN
     INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.provider_id,NEW.request_id,'Proposta expirada: a validade terminou');
     RETURN NEW;
    END IF;
    label:='Proposta atualizada: '||NEW.status;
   ELSE RETURN NEW; END IF;
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
\echo 'Historico de versoes da proposta e status Expirada habilitados.'
