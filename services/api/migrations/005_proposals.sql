\set ON_ERROR_STOP on
\connect maridao
BEGIN;
CREATE TABLE IF NOT EXISTS maridao.proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES maridao.service_requests(id) ON DELETE RESTRICT,
 provider_id uuid NOT NULL REFERENCES maridao.provider_profiles(account_id) ON DELETE RESTRICT,
 amount numeric(8,2) NOT NULL CHECK (amount > 0 AND amount <= 999999.99),
 description varchar(3000) NOT NULL CHECK (btrim(description) <> ''),
 estimated_duration varchar(200) NOT NULL CHECK (btrim(estimated_duration) <> ''),
 valid_until date NOT NULL,
 status varchar(30) NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Aceita','Não selecionada','Retirada')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,provider_id)
);
CREATE INDEX IF NOT EXISTS proposals_request_created_idx ON maridao.proposals(request_id,created_at DESC,id DESC);
REVOKE ALL ON maridao.proposals FROM PUBLIC;
GRANT SELECT,INSERT ON maridao.proposals TO maridao_api;
COMMIT;
\echo 'Tabela de propostas criada com sucesso.'
