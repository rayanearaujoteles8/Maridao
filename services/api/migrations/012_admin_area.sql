\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
-- RF10.4 / UC10.4 fluxo 2: senha provisória definida pelo administrador.
ALTER TABLE maridao.accounts ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
-- UC01.3 fluxo 2: a exclusão elimina os dados pessoais; a conta fica só como referência do histórico.
ALTER TABLE maridao.accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE maridao.accounts ALTER COLUMN email DROP NOT NULL;
ALTER TABLE maridao.accounts DROP CONSTRAINT IF EXISTS accounts_deleted_disabled_check;
ALTER TABLE maridao.accounts ADD CONSTRAINT accounts_deleted_disabled_check CHECK(deleted_at IS NULL OR disabled_at IS NOT NULL);
-- Só a conta excluída fica sem e-mail; o índice único ignora nulos.
ALTER TABLE maridao.accounts DROP CONSTRAINT IF EXISTS accounts_email_required_check;
ALTER TABLE maridao.accounts ADD CONSTRAINT accounts_email_required_check CHECK(email IS NOT NULL OR deleted_at IS NOT NULL);
GRANT UPDATE(must_change_password,email,deleted_at) ON maridao.accounts TO maridao_api;
ALTER TABLE maridao.customer_profiles ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE maridao.customer_profiles ALTER COLUMN cpf DROP NOT NULL;
ALTER TABLE maridao.customer_profiles ALTER COLUMN neighborhood DROP NOT NULL;
GRANT UPDATE(cpf) ON maridao.customer_profiles TO maridao_api;

-- RF14.4 / UC14.4: o papel de administrador é derivado do perfil, como cliente e prestador.
CREATE TABLE IF NOT EXISTS maridao.admin_profiles (
 account_id uuid PRIMARY KEY REFERENCES maridao.accounts(id) ON DELETE RESTRICT,
 full_name varchar(150) NOT NULL CHECK (btrim(full_name) <> ''),
 created_by uuid REFERENCES maridao.accounts(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON maridao.admin_profiles FROM PUBLIC;
GRANT SELECT,INSERT ON maridao.admin_profiles TO maridao_api;

-- RF14.3 / RNF02.3: prestadores já existentes viram 'Aprovado'; novos autocadastros nascem 'Em análise'.
ALTER TABLE maridao.provider_profiles ADD COLUMN IF NOT EXISTS approval_status varchar(12) NOT NULL DEFAULT 'Aprovado';
ALTER TABLE maridao.provider_profiles ALTER COLUMN approval_status SET DEFAULT 'Em análise';
ALTER TABLE maridao.provider_profiles ADD COLUMN IF NOT EXISTS approval_reason varchar(500);
ALTER TABLE maridao.provider_profiles ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz;
ALTER TABLE maridao.provider_profiles ADD COLUMN IF NOT EXISTS approval_decided_by uuid REFERENCES maridao.accounts(id);
ALTER TABLE maridao.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_approval_status_check;
ALTER TABLE maridao.provider_profiles ADD CONSTRAINT provider_profiles_approval_status_check CHECK(approval_status IN ('Em análise','Aprovado','Rejeitado'));
ALTER TABLE maridao.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_approval_decision_check;
-- 'Aprovado' sem responsável só existe para os cadastros anteriores a esta migração.
ALTER TABLE maridao.provider_profiles ADD CONSTRAINT provider_profiles_approval_decision_check CHECK(
 (approval_status='Em análise' AND approval_reason IS NULL AND approval_decided_at IS NULL AND approval_decided_by IS NULL) OR
 (approval_status='Aprovado' AND approval_reason IS NULL AND ((approval_decided_at IS NULL)=(approval_decided_by IS NULL))) OR
 (approval_status='Rejeitado' AND approval_reason IS NOT NULL AND btrim(approval_reason)<>'' AND approval_decided_at IS NOT NULL AND approval_decided_by IS NOT NULL));
CREATE INDEX IF NOT EXISTS provider_profiles_pending_idx ON maridao.provider_profiles(created_at,account_id) WHERE approval_status='Em análise';
GRANT UPDATE(approval_status,approval_reason,approval_decided_at,approval_decided_by) ON maridao.provider_profiles TO maridao_api;

-- RNF02.3 / RNF02.4: registro permanente das decisões administrativas (sem UPDATE nem DELETE para a API).
-- admin_id nulo só existe para o primeiro administrador, criado por npm run admin:create.
CREATE TABLE IF NOT EXISTS maridao.admin_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 admin_id uuid REFERENCES maridao.accounts(id),
 target_account_id uuid NOT NULL REFERENCES maridao.accounts(id),
 action varchar(30) NOT NULL CHECK(action IN ('admin_created','account_created','account_edited','account_deactivated','account_deleted','provider_approved','provider_rejected')),
 reason varchar(500) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(action NOT IN ('account_deactivated','account_deleted','provider_rejected') OR btrim(reason)<>''),
 CHECK(admin_id IS NOT NULL OR action='admin_created')
);
CREATE INDEX IF NOT EXISTS admin_events_target_idx ON maridao.admin_events(target_account_id,id);
REVOKE ALL ON maridao.admin_events FROM PUBLIC;
GRANT SELECT,INSERT ON maridao.admin_events TO maridao_api;
GRANT USAGE,SELECT ON SEQUENCE maridao.admin_events_id_seq TO maridao_api;

-- UC14.3: o prestador é notificado da decisão. Este aviso não pertence a um pedido.
ALTER TABLE maridao.notifications ALTER COLUMN request_id DROP NOT NULL;
CREATE OR REPLACE FUNCTION maridao.notify_provider_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status IN ('Aprovado','Rejeitado') THEN
  INSERT INTO maridao.notifications(account_id,request_id,title) VALUES(NEW.account_id,NULL,
   CASE WHEN NEW.approval_status='Aprovado' THEN 'Cadastro aprovado: seu perfil já aparece nas buscas' ELSE 'Cadastro rejeitado: veja o motivo no seu perfil' END);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.notify_provider_approval() FROM PUBLIC;
DROP TRIGGER IF EXISTS notify_provider_approval ON maridao.provider_profiles;
CREATE TRIGGER notify_provider_approval AFTER UPDATE OF approval_status ON maridao.provider_profiles FOR EACH ROW EXECUTE FUNCTION maridao.notify_provider_approval();
COMMIT;
\echo 'Area administrativa, senha provisoria e aprovacao de prestadores habilitadas.'
