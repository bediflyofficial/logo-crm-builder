BEGIN;

DO $phase6_grants$
DECLARE
  required_server_function text;
  restricted_table text;
BEGIN
  -- Browser roles receive only the table operations their RLS policies use.
  IF has_table_privilege('anon', 'public.meta_conversion_delivery_attempts', 'SELECT')
    OR has_table_privilege('anon', 'public.meta_conversion_rules', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role retains Meta conversion table access';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.meta_conversion_delivery_attempts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.meta_conversion_delivery_attempts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.meta_conversion_delivery_attempts', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.meta_conversion_delivery_attempts', 'DELETE')
    OR has_table_privilege('authenticated', 'public.meta_conversion_delivery_attempts', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Delivery-history grants exceed read-only browser access';
  END IF;
  FOREACH restricted_table IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.meta_conversion_rules', restricted_table) THEN
      RAISE EXCEPTION 'Workspace-admin conversion-rule operation % is unavailable', restricted_table;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.meta_conversion_rules', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Browser role can truncate conversion rules';
  END IF;

  -- Credential, OAuth and raw-webhook tables remain server-only.
  FOREACH restricted_table IN ARRAY ARRAY['meta_asset_credentials','meta_capi_configs','meta_oauth_sessions','meta_webhook_events'] LOOP
    IF has_table_privilege('anon', 'public.' || restricted_table, 'SELECT')
      OR has_table_privilege('authenticated', 'public.' || restricted_table, 'SELECT') THEN
      RAISE EXCEPTION 'Browser role can read server-only table %', restricted_table;
    END IF;
  END LOOP;

  -- Privileged functions cannot be called directly by browser roles.
  FOREACH required_server_function IN ARRAY ARRAY[
    'claim_meta_lead_jobs(integer)',
    'ingest_meta_lead(uuid,integer,uuid,jsonb,jsonb)',
    'record_meta_consent(uuid,uuid,boolean,boolean,text,text,text,text,boolean,boolean,uuid)',
    'recheck_meta_conversion_consent(uuid)',
    'reserve_meta_conversion_send(uuid,uuid)',
    'reserve_meta_conversion_test(uuid,uuid)',
    'claim_meta_conversion_events(integer)',
    'complete_meta_conversion_delivery(uuid,uuid,uuid,text,text,text,integer,integer)',
    'request_meta_conversion_retry(uuid,uuid)',
    'meta_conversion_analytics(uuid,timestamptz,timestamptz,text,text)'
  ] LOOP
    IF has_function_privilege('anon', 'public.' || required_server_function, 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.' || required_server_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser role can execute privileged function %', required_server_function;
    END IF;
    IF NOT has_function_privilege('service_role', 'public.' || required_server_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Server role cannot execute required function %', required_server_function;
    END IF;
  END LOOP;
END;
$phase6_grants$;

ROLLBACK;
