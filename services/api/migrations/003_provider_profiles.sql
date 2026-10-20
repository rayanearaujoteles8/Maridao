\set ON_ERROR_STOP on
\connect maridao
BEGIN;
CREATE TABLE maridao.provider_profiles (
 account_id uuid PRIMARY KEY REFERENCES maridao.accounts(id) ON DELETE RESTRICT,
 full_name varchar(150) NOT NULL CHECK (btrim(full_name) <> ''),
 phone varchar(11) NOT NULL CHECK (phone ~ '^[0-9]{10,11}$'),
 document_type varchar(4) NOT NULL CHECK (document_type IN ('CPF','CNPJ')),
 document_encrypted text NOT NULL CHECK (document_encrypted LIKE 'v1.%'),
 document_fingerprint char(64) NOT NULL UNIQUE CHECK (document_fingerprint ~ '^[a-f0-9]{64}$'),
 categories text[] NOT NULL CHECK (cardinality(categories) BETWEEN 1 AND 20),
 specialties text[] NOT NULL CHECK (cardinality(specialties) BETWEEN 1 AND 20),
 neighborhoods text[] NOT NULL CHECK (cardinality(neighborhoods) BETWEEN 1 AND 50),
 availability varchar(500) NOT NULL CHECK (btrim(availability) <> ''),
 city varchar(60) NOT NULL DEFAULT 'Palmas' CHECK (city = 'Palmas'),
 state char(2) NOT NULL DEFAULT 'TO' CHECK (state = 'TO'),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON maridao.provider_profiles FROM PUBLIC;
GRANT SELECT, INSERT ON maridao.provider_profiles TO maridao_api;
COMMIT;
\echo 'Tabela de prestadores criada com sucesso.'
