\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- UC01.3 fluxo 1 / RNF02.4: a exclusão pedida pelo próprio cliente e a inativação pedida pelo próprio prestador
-- ficam no mesmo registro das decisões administrativas (data, hora, autor e motivo).
-- actor_kind diz quem agiu: 'administration' (admin_id preenchido) ou o próprio titular ('customer'/'provider', admin_id nulo; o autor é a conta de target_account_id).
ALTER TABLE maridao.admin_events ADD COLUMN IF NOT EXISTS actor_kind varchar(20) NOT NULL DEFAULT 'administration';
-- A 012 criou sem nome o CHECK "admin_id só é nulo para admin_created"; ele é trocado pela regra abaixo.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='maridao.admin_events'::regclass AND contype='c'
  AND conname<>'admin_events_actor_check' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%admin_id IS NOT NULL%' LOOP
  EXECUTE format('ALTER TABLE maridao.admin_events DROP CONSTRAINT %I',c.conname);
 END LOOP;
END;
$$;
ALTER TABLE maridao.admin_events DROP CONSTRAINT IF EXISTS admin_events_actor_check;
ALTER TABLE maridao.admin_events ADD CONSTRAINT admin_events_actor_check CHECK(
 (actor_kind='administration' AND (admin_id IS NOT NULL OR action='admin_created')) OR
 (actor_kind='customer' AND admin_id IS NULL AND action='account_deleted') OR
 (actor_kind='provider' AND admin_id IS NULL AND action='account_deactivated'));
GRANT SELECT,INSERT ON maridao.admin_events TO maridao_api;

-- RF13: mesma função da 015 (as marcas 013, 014 e 015 continuam), com os textos do aceite, do cancelamento e da proposta não selecionada (marcados com 016).
CREATE OR REPLACE FUNCTION maridao.notify_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record; recipient uuid; label text; customer_label text; provider_label text;
BEGIN
 IF TG_TABLE_NAME='service_requests' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- 016: o cancelamento é avisado por notify_cancellation, a partir do evento registrado, que diz quem cancelou.
  IF NEW.status='Cancelada' THEN RETURN NEW; END IF;
  SELECT provider_id INTO recipient FROM maridao.proposals WHERE id=NEW.selected_proposal_id;
  customer_label:='Pedido atualizado: '||NEW.status; provider_label:='Atendimento atualizado: '||NEW.status;
  -- 016: aceite (UC13.2). Um aviso para cada parte, com o próximo passo.
  IF OLD.status='Aberta' AND NEW.status='Aceita' THEN
   customer_label:='Proposta aceita: combine os detalhes com o prestador pelo chat'; provider_label:='Sua proposta foi aceita: combine os detalhes com o cliente pelo chat';
  -- 014: conclusão registrada, contestada, confirmada pelo cliente ou confirmada pelo sistema.
  ELSIF OLD.status='Em andamento' AND NEW.status='Aguardando confirmação' THEN customer_label:='Conclusão registrada pelo prestador: confirme ou conteste';
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
    -- 013: quando o pedido é cancelado, o prestador escolhido já é avisado pelo cancelamento do pedido.
    IF NEW.status='Cancelada' AND r.request_status='Cancelada' AND r.selected_proposal_id=NEW.id THEN RETURN NEW; END IF;
    -- 015: expiração (RN04). Só o prestador é avisado; o cliente vê a proposta marcada na lista.
    IF NEW.status='Expirada' THEN
     INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.provider_id,NEW.request_id,'Proposta expirada: a validade terminou');
     RETURN NEW;
    END IF;
    -- 016: no aceite, cliente e prestador escolhido já são avisados pela mudança do pedido.
    IF NEW.status='Aceita' THEN RETURN NEW; END IF;
    -- 016: proposta não selecionada ou encerrada (UC13.3). Só o prestador que a enviou é avisado; o cliente não recebe um aviso por proposta.
    IF NEW.status IN ('Não selecionada','Cancelada') THEN
     INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.provider_id,NEW.request_id,
      CASE WHEN NEW.status='Cancelada' OR r.request_status='Cancelada' THEN 'Solicitação cancelada: sua proposta foi encerrada' ELSE 'Proposta não selecionada: o cliente escolheu outra proposta' END);
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

-- RF13.3 / UC04.4: o cancelamento avisa a outra parte dizendo quem cancelou. Quem cancelou não recebe aviso da própria ação.
-- Todo cancelamento grava um evento em request_events (cancelamento pelo cliente ou prestador, protocolo de suporte, encerramento de conta, substituição de pedido).
CREATE OR REPLACE FUNCTION maridao.notify_cancellation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record; label text;
BEGIN
 IF NEW.next_status IS DISTINCT FROM 'Cancelada' OR NEW.previous_status IS NOT DISTINCT FROM 'Cancelada' THEN RETURN NEW; END IF;
 -- Encerramento de conta e substituição de pedido só alcançam pedidos abertos: quem tinha proposta pendente é avisado pela mudança da proposta.
 IF NEW.action IN ('account_closed','request_replaced') THEN RETURN NEW; END IF;
 SELECT s.customer_id,p.provider_id INTO r FROM maridao.service_requests s LEFT JOIN maridao.proposals p ON p.id=s.selected_proposal_id WHERE s.id=NEW.request_id;
 label:=CASE NEW.actor_kind
  WHEN 'customer' THEN 'Atendimento cancelado pelo cliente: veja o motivo na solicitação'
  WHEN 'provider' THEN 'Solicitação cancelada pelo prestador: veja o motivo e, se quiser, crie uma nova solicitação'
  WHEN 'administration' THEN 'Solicitação cancelada pela administração: veja o motivo na solicitação'
  ELSE 'Solicitação cancelada' END;
 IF NEW.actor_kind<>'customer' THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(r.customer_id,NEW.request_id,label); END IF;
 IF r.provider_id IS NOT NULL AND NEW.actor_kind<>'provider' THEN INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(r.provider_id,NEW.request_id,label); END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.notify_cancellation() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_cancellation ON maridao.request_events;
CREATE TRIGGER notify_cancellation AFTER INSERT ON maridao.request_events FOR EACH ROW EXECUTE FUNCTION maridao.notify_cancellation();

-- UC14.3: mesma função da 012; a aprovação passa a dizer o próximo passo.
CREATE OR REPLACE FUNCTION maridao.notify_provider_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status IN ('Aprovado','Rejeitado') THEN
  INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.account_id,NULL,
   CASE WHEN NEW.approval_status='Aprovado' THEN 'Cadastro aprovado: seu perfil aparece nas buscas e você já pode enviar propostas' ELSE 'Cadastro rejeitado: veja o motivo no seu perfil' END);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.notify_provider_approval() FROM PUBLIC;
COMMIT;
\echo 'Autoexclusao do cliente registrada e textos das notificacoes revisados.'
