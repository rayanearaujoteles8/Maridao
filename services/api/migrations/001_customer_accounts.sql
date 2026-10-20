\set ON_ERROR_STOP on
\connect maridao
BEGIN;

CREATE SCHEMA maridao AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA maridao FROM PUBLIC;
GRANT USAGE ON SCHEMA maridao TO maridao_api;

-- RF10.4 / UC10.4: credentials are separate from customer profile data.
-- The API must generate a password hash before inserting an account.
CREATE TABLE maridao.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL,
    password_hash text NOT NULL CHECK (length(password_hash) >= 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT accounts_email_normalized CHECK (
        email = lower(btrim(email)) AND email <> '' AND position('@' in email) > 1
    )
);
CREATE UNIQUE INDEX accounts_email_unique ON maridao.accounts (lower(email));

-- RF01.1 / UC01.1: regional first version approved for Palmas, Tocantins.
CREATE TABLE maridao.customer_profiles (
    account_id uuid PRIMARY KEY REFERENCES maridao.accounts(id) ON DELETE RESTRICT,
    full_name varchar(150) NOT NULL CHECK (btrim(full_name) <> ''),
    phone varchar(11) NOT NULL CHECK (phone ~ '^[0-9]{10,11}$'),
    cpf varchar(11) NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
    neighborhood varchar(100) NOT NULL CHECK (btrim(neighborhood) <> ''),
    city varchar(60) NOT NULL DEFAULT 'Palmas' CHECK (city = 'Palmas'),
    state char(2) NOT NULL DEFAULT 'TO' CHECK (state = 'TO'),
    created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON maridao.accounts, maridao.customer_profiles FROM PUBLIC;
-- Only permissions required by initial signup and subsequent authentication.
GRANT SELECT, INSERT ON maridao.accounts, maridao.customer_profiles TO maridao_api;

COMMIT;
\echo 'Estrutura inicial do Maridao criada com sucesso.'
