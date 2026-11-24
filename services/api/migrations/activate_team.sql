\encoding UTF8
\set ON_ERROR_STOP on
-- Run with psql -U postgres -d maridao -f migrations/activate_team.sql
-- Depois da 017, a 012 antiga não pode reinstalar a restrição sem motivo nas aprovações.
SELECT to_regclass('maridao.notification_outbox') IS NOT NULL AS has_delivery_queue \gset
\if :has_delivery_queue
\echo 'Base anterior a 017 ja preparada; preservando as regras atualizadas.'
\else
\ir 009_proposal_management.sql
\ir 010_customer_confirmation.sql
\ir 011_team_workflows.sql
\ir 012_admin_area.sql
\ir 013_request_cancellation.sql
\ir 014_customer_confirmed_completion.sql
\ir 015_proposal_versions.sql
\ir 016_customer_self_deletion.sql
\endif
\ir 017_notification_delivery.sql
\ir 018_profile_photos.sql
\echo 'Atualizações aplicadas. Reinicie a API e o Expo.'
