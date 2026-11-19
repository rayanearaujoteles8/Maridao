\encoding UTF8
\set ON_ERROR_STOP on
-- Run with psql -U postgres -d maridao -f migrations/activate_team.sql
\ir 009_proposal_management.sql
\ir 010_customer_confirmation.sql
\ir 011_team_workflows.sql
\ir 012_admin_area.sql
\ir 013_request_cancellation.sql
\ir 014_customer_confirmed_completion.sql
\ir 015_proposal_versions.sql
\ir 016_customer_self_deletion.sql
\echo 'Atualizações aplicadas. Reinicie a API e o Expo.'
