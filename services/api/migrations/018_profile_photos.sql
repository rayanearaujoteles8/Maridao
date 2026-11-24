\encoding UTF8
\set ON_ERROR_STOP on
\connect maridao
BEGIN;
CREATE TABLE IF NOT EXISTS maridao.profile_photos (
 account_id uuid PRIMARY KEY REFERENCES maridao.accounts(id) ON DELETE CASCADE,
 image bytea NOT NULL CHECK(octet_length(image)<=1048576),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON maridao.profile_photos TO maridao_api;
CREATE OR REPLACE FUNCTION maridao.erase_profile_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN DELETE FROM maridao.profile_photos WHERE account_id=NEW.id; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION maridao.erase_profile_photo() FROM PUBLIC;
DROP TRIGGER IF EXISTS erase_profile_photo ON maridao.accounts;
CREATE TRIGGER erase_profile_photo AFTER UPDATE OF deleted_at ON maridao.accounts FOR EACH ROW EXECUTE FUNCTION maridao.erase_profile_photo();
COMMIT;
