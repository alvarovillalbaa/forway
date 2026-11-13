-- Fresh installation only. Never apply automatically from a request.
BEGIN;
DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forway_runtime') THEN
    RAISE EXCEPTION 'forway_runtime already exists; inspect ownership before installation';
  END IF;
  CREATE ROLE forway_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOINHERIT NOREPLICATION NOBYPASSRLS;
END
$bootstrap$;
CREATE SCHEMA forway_private;
REVOKE ALL ON SCHEMA forway_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA forway_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA forway_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE forway_private.schema_version (version integer PRIMARY KEY CHECK (version = 1));
INSERT INTO forway_private.schema_version VALUES (1);

CREATE FUNCTION forway_private.actor_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('forway.actor_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION forway_private.actor_id() FROM PUBLIC;

CREATE FUNCTION forway_private.document_valid(text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE value jsonb;
BEGIN
  IF $1 IS NULL OR octet_length($1) > 4194304 THEN RETURN false; END IF;
  value := $1::jsonb;
  RETURN jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['version','source','draft','observations']
    AND value - ARRAY['version','source','draft','observations'] = '{}'::jsonb
    AND value->'version' = '1'::jsonb
    AND jsonb_typeof(value->'source') IN ('null','object')
    AND jsonb_typeof(value->'draft') IN ('null','object')
    AND jsonb_typeof(value->'observations') = 'array'
    AND jsonb_array_length(value->'observations') <= 500;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION forway_private.document_valid(text) FROM PUBLIC;

CREATE TABLE forway_private.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  document_text text,
  content_hash text,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK ((deleted_at IS NULL AND length(title) BETWEEN 1 AND 120
      AND title = btrim(title) AND title !~ '[[:cntrl:]]'
      AND forway_private.document_valid(document_text)
      AND content_hash IS NOT NULL
      AND content_hash = encode(sha256(convert_to(document_text, 'UTF8')), 'hex'))
    OR (deleted_at IS NOT NULL AND title = '' AND document_text IS NULL AND content_hash IS NULL))
);
CREATE INDEX workspaces_owner_updated ON forway_private.workspaces(owner_id, updated_at DESC, id)
  WHERE deleted_at IS NULL;
CREATE TABLE forway_private.operations (
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'
    AND receipt ?& ARRAY['id','revision','contentHash','deleted','createdAt','updatedAt']
    AND receipt - ARRAY['id','revision','contentHash','deleted','createdAt','updatedAt'] = '{}'::jsonb),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, operation_id)
);
ALTER TABLE forway_private.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE forway_private.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE forway_private.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forway_private.operations FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_owner ON forway_private.workspaces TO forway_runtime
  USING (owner_id = forway_private.actor_id())
  WITH CHECK (owner_id = forway_private.actor_id());
CREATE POLICY operation_owner ON forway_private.operations TO forway_runtime
  USING (owner_id = forway_private.actor_id())
  WITH CHECK (owner_id = forway_private.actor_id());
GRANT USAGE ON SCHEMA forway_private TO forway_runtime;
GRANT EXECUTE ON FUNCTION forway_private.actor_id(), forway_private.document_valid(text) TO forway_runtime;
GRANT SELECT ON forway_private.schema_version TO forway_runtime;
GRANT SELECT, INSERT, UPDATE ON forway_private.workspaces TO forway_runtime;
GRANT SELECT, INSERT ON forway_private.operations TO forway_runtime;
COMMIT;
