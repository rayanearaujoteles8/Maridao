\set ON_ERROR_STOP on
\connect maridao
BEGIN;
CREATE TABLE maridao.service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES maridao.customer_profiles(account_id) ON DELETE RESTRICT,
 category varchar(100) NOT NULL CHECK (btrim(category) <> ''),
 description varchar(3000) NOT NULL CHECK (btrim(description) <> ''),
 neighborhood varchar(100) NOT NULL CHECK (btrim(neighborhood) <> ''),
 city varchar(60) NOT NULL DEFAULT 'Palmas' CHECK (city = 'Palmas'),
 state char(2) NOT NULL DEFAULT 'TO' CHECK (state = 'TO'),
 preferred_date date,
 preferred_period varchar(100),
 status varchar(30) NOT NULL DEFAULT 'Aberta' CHECK (status = 'Aberta'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_customer_created_idx ON maridao.service_requests(customer_id,created_at DESC);
REVOKE ALL ON maridao.service_requests FROM PUBLIC;
GRANT SELECT, INSERT ON maridao.service_requests TO maridao_api;
COMMIT;
\echo 'Tabela de solicitacoes criada com sucesso.'
