\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- RNF02.3: preserva aprovações antigas sem motivo; decisões novas o exigem.
ALTER TABLE maridao.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_approval_decision_check;
ALTER TABLE maridao.provider_profiles ADD CONSTRAINT provider_profiles_approval_decision_check CHECK(
 (approval_status='Em análise' AND approval_reason IS NULL AND approval_decided_at IS NULL AND approval_decided_by IS NULL) OR
 (approval_status='Aprovado' AND (approval_reason IS NULL OR btrim(approval_reason)<>'') AND ((approval_decided_at IS NULL)=(approval_decided_by IS NULL))) OR
 (approval_status='Rejeitado' AND approval_reason IS NOT NULL AND btrim(approval_reason)<>'' AND approval_decided_at IS NOT NULL AND approval_decided_by IS NOT NULL));
CREATE OR REPLACE FUNCTION maridao.require_decision_reason() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status IN ('Aprovado','Rejeitado')
  AND (NEW.approval_reason IS NULL OR btrim(NEW.approval_reason)='') THEN
  RAISE EXCEPTION 'Informe o motivo da decisão.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.require_decision_reason() FROM PUBLIC;
DROP TRIGGER IF EXISTS require_decision_reason ON maridao.provider_profiles;
CREATE TRIGGER require_decision_reason BEFORE UPDATE OF approval_status ON maridao.provider_profiles FOR EACH ROW EXECUTE FUNCTION maridao.require_decision_reason();
-- UC13.1: o evento é persistido junto com a operação; sua entrega é independente.
CREATE TABLE IF NOT EXISTS maridao.notification_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES maridao.accounts(id),
 request_id uuid REFERENCES maridao.service_requests(id),
 title varchar(150) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivered_at timestamptz,
 last_error_code varchar(20)
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
 ON maridao.notification_outbox(next_attempt_at,id) WHERE delivered_at IS NULL;
ALTER TABLE maridao.notifications ADD COLUMN IF NOT EXISTS delivery_id bigint REFERENCES maridao.notification_outbox(id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_delivery_id_idx ON maridao.notifications(delivery_id) WHERE delivery_id IS NOT NULL;
REVOKE ALL ON maridao.notification_outbox FROM PUBLIC;
GRANT SELECT ON maridao.notification_outbox TO maridao_api;
-- Preserva as regras e os destinatários da 016, trocando apenas o destino da gravação.
DO $$
DECLARE routine text; definition text;
BEGIN
 FOREACH routine IN ARRAY ARRAY['notify_workflow','notify_cancellation','notify_provider_approval'] LOOP
  SELECT pg_get_functiondef(to_regprocedure('maridao.'||routine||'()')) INTO STRICT definition;
  definition:=replace(definition,'INSERT INTO maridao.notifications(','INSERT INTO maridao.notification_outbox(');
  EXECUTE definition;
 END LOOP;
END;
$$;
-- Cada entrega usa um subbloco: falha nela não desfaz o atendimento nem as outras entregas.
CREATE OR REPLACE FUNCTION maridao.deliver_notifications(batch_size integer DEFAULT 100)
RETURNS TABLE(delivered integer,failed integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; error_code text;
BEGIN
 IF batch_size<1 OR batch_size>500 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 delivered:=0;failed:=0;
 FOR item IN SELECT * FROM maridao.notification_outbox
  WHERE delivered_at IS NULL AND next_attempt_at<=clock_timestamp()
  ORDER BY id LIMIT batch_size FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   INSERT INTO maridao.notifications(account_id,request_id,title,created_at,delivery_id)
    VALUES(item.account_id,item.request_id,item.title,item.created_at,item.id)
    ON CONFLICT(delivery_id) WHERE delivery_id IS NOT NULL DO NOTHING;
   UPDATE maridao.notification_outbox SET delivered_at=clock_timestamp(),attempts=attempts+1,last_error_code=NULL WHERE id=item.id;
   delivered:=delivered+1;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS error_code=RETURNED_SQLSTATE;
   UPDATE maridao.notification_outbox SET attempts=attempts+1,last_error_code=error_code,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,5*(power(2,least(attempts,6)))::integer)) WHERE id=item.id;
   failed:=failed+1;
  END;
 END LOOP;
 RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION maridao.deliver_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION maridao.deliver_notifications(integer) TO maridao_api;
COMMIT;
\echo 'Fila de notificacoes e novas tentativas de entrega habilitadas.'
