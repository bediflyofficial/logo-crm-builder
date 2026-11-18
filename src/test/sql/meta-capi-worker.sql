BEGIN;

DO $phase4$
DECLARE
  org_a constant uuid := 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  org_b constant uuid := 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  actor constant uuid := '0b9ef4c7-6620-4a16-a0b5-dfb7869e00ea';
  lead_a constant uuid := '20000001-0000-4000-8000-000000000001';
  lead_b constant uuid := '20000001-0000-4000-8000-000000000002';
  lead_test constant uuid := '20000001-0000-4000-8000-000000000003';
  event_a constant uuid := '30000001-0000-4000-8000-000000000001';
  event_b constant uuid := '30000001-0000-4000-8000-000000000002';
  event_test constant uuid := '30000001-0000-4000-8000-000000000003';
  consent_a uuid;
  consent_b uuid;
  consent_test uuid;
  claimed public.meta_conversion_events;
  first_lease uuid;
  second_lease uuid;
  ok boolean;
  row_count integer;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (org_a, 'Phase 4 rollback test A'),
    (org_b, 'Phase 4 rollback test B');
  INSERT INTO public.organization_members (organization_id, user_id, full_name, is_active) VALUES
    (org_a, actor, 'Rollback admin', true),
    (org_b, actor, 'Rollback executive', true);
  INSERT INTO public.user_roles (organization_id, user_id, role) VALUES
    (org_a, actor, 'client_admin'),
    (org_b, actor, 'sales_exec');

  INSERT INTO public.leads (id, organization_id, full_name, email, phone, status, quality) VALUES
    (lead_a, org_a, 'Retry lead A', 'a@example.com', '+12025550123', 'New Lead', 'Warm'),
    (lead_b, org_b, 'Retry lead B', 'b@example.com', '+12025550124', 'New Lead', 'Warm'),
    (lead_test, org_b, 'Test-only lead', 'test@example.com', '+12025550125', 'New Lead', 'Warm');

  INSERT INTO public.meta_consent_evidence (id,organization_id,lead_id,advertising_accepted,matching_accepted,notice_version,evidence_reference,region,consent_source,recorded_at) VALUES
    (gen_random_uuid(),org_a,lead_a,true,true,'Notice v1','phase4-a','IN','customer_form',now()-interval '1 hour')
    RETURNING id INTO consent_a;
  INSERT INTO public.meta_consent_evidence (id,organization_id,lead_id,advertising_accepted,matching_accepted,notice_version,evidence_reference,region,consent_source,recorded_at) VALUES
    (gen_random_uuid(),org_b,lead_b,true,true,'Notice v1','phase4-b','IN','customer_form',now()-interval '1 hour')
    RETURNING id INTO consent_b;
  INSERT INTO public.meta_consent_evidence (id,organization_id,lead_id,advertising_accepted,matching_accepted,notice_version,evidence_reference,region,consent_source,recorded_at) VALUES
    (gen_random_uuid(),org_b,lead_test,true,true,'Notice v1','phase4-test','IN','customer_form',now()-interval '1 hour')
    RETURNING id INTO consent_test;

  INSERT INTO public.meta_capi_configs (organization_id,dataset_id,encrypted_capi_token,test_event_code,capi_enabled,status,last_test_event_at,dataset_eligible,eligibility_reviewed_at) VALUES
    (org_a,'DATASET-A','rollback-only-encrypted-a','TEST-A',true,'production_active',now(),true,now()),
    (org_b,'DATASET-B','rollback-only-encrypted-b','TEST-B',true,'production_active',now(),true,now());

  INSERT INTO public.meta_conversion_events (id,organization_id,lead_id,consent_id,event_name,outcome_reference,occurred_at,action_source,status,created_at) VALUES
    (event_a,org_a,lead_a,consent_a,'QualifiedLead','phase4:a',now(),'system_generated','pending',now()-interval '1 minute'),
    (event_b,org_b,lead_b,consent_b,'QualifiedLead','phase4:b',now(),'system_generated','pending',now()),
    (event_test,org_b,lead_test,consent_test,'QualifiedLead','phase4:test',now(),'system_generated','pending',now());
  UPDATE public.meta_conversion_events SET test_event = true WHERE id = event_test;

  -- Atomic claims select each workspace once and pin its own Dataset.
  SELECT * INTO claimed FROM public.claim_meta_conversion_events(1);
  IF claimed.id <> event_a OR claimed.organization_id <> org_a OR claimed.sent_dataset_id <> 'DATASET-A' OR claimed.attempts <> 1 OR claimed.lease_token IS NULL THEN
    RAISE EXCEPTION 'First atomic claim did not isolate workspace A';
  END IF;
  first_lease := claimed.lease_token;
  SELECT * INTO claimed FROM public.claim_meta_conversion_events(1);
  IF claimed.id <> event_b OR claimed.organization_id <> org_b OR claimed.sent_dataset_id <> 'DATASET-B' OR claimed.attempts <> 1 THEN
    RAISE EXCEPTION 'Second atomic claim did not isolate workspace B';
  END IF;
  second_lease := claimed.lease_token;
  SELECT count(*) INTO row_count FROM public.claim_meta_conversion_events(1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'A leased event was claimed twice'; END IF;

  -- Confirmed temporary failure receives a bounded retry and safe history.
  SELECT public.complete_meta_conversion_delivery(event_a,org_a,first_lease,'failed','meta_unavailable','temporary',60,0) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'Temporary completion did not match its lease'; END IF;
  SELECT * INTO claimed FROM public.meta_conversion_events WHERE id = event_a;
  IF claimed.status <> 'failed' OR claimed.failure_kind <> 'temporary' OR claimed.next_attempt_at IS NULL OR claimed.lease_token IS NOT NULL THEN
    RAISE EXCEPTION 'Temporary failure was not scheduled correctly';
  END IF;
  SELECT count(*) INTO row_count FROM public.meta_conversion_delivery_attempts WHERE id = first_lease AND status = 'failed' AND error_code = 'meta_unavailable' AND finished_at IS NOT NULL;
  IF row_count <> 1 THEN RAISE EXCEPTION 'Safe delivery history was not saved'; END IF;
  SELECT count(*) INTO row_count FROM public.claim_meta_conversion_events(1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'Future retry or test event entered the worker'; END IF;

  -- A retry keeps the same stable event ID and original Dataset.
  UPDATE public.meta_conversion_events SET next_attempt_at = now()-interval '1 second' WHERE id = event_a;
  SELECT * INTO claimed FROM public.claim_meta_conversion_events(1);
  IF claimed.id <> event_a OR claimed.attempts <> 2 OR claimed.sent_dataset_id <> 'DATASET-A' OR claimed.lease_token = first_lease THEN
    RAISE EXCEPTION 'Retry changed event identity, Dataset, or lease ownership';
  END IF;
  first_lease := claimed.lease_token;

  -- Invalid credentials pause only the affected workspace.
  SELECT public.complete_meta_conversion_delivery(event_a,org_a,first_lease,'failed','meta_token_invalid','permanent',NULL,0) INTO ok;
  SELECT count(*) INTO row_count FROM public.meta_capi_configs WHERE organization_id = org_a AND NOT capi_enabled AND status = 'connection_error';
  IF row_count <> 1 THEN RAISE EXCEPTION 'Invalid token did not pause workspace A'; END IF;
  SELECT count(*) INTO row_count FROM public.meta_capi_configs WHERE organization_id = org_b AND capi_enabled AND status = 'production_active';
  IF row_count <> 1 THEN RAISE EXCEPTION 'Workspace A token failure paused workspace B'; END IF;

  -- An administrator can explicitly authorize one retry beyond the automatic limit.
  UPDATE public.meta_conversion_events SET attempts = 8 WHERE id = event_a;
  SELECT * INTO claimed FROM public.request_meta_conversion_retry(org_a,event_a);
  IF claimed.status <> 'pending' OR claimed.retry_requested_at IS NULL THEN RAISE EXCEPTION 'Manual retry was not queued'; END IF;
  UPDATE public.meta_capi_configs SET capi_enabled = true, status = 'production_active', last_error = NULL WHERE organization_id = org_a;
  SELECT * INTO claimed FROM public.claim_meta_conversion_events(1);
  IF claimed.id <> event_a OR claimed.attempts <> 9 OR claimed.retry_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'Authorized retry did not receive exactly one new lease';
  END IF;

  -- Expired work becomes uncertain and is never automatically replayed.
  UPDATE public.meta_conversion_events SET lease_until = now()-interval '1 second' WHERE id = event_b;
  SELECT count(*) INTO row_count FROM public.claim_meta_conversion_events(1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'Expired uncertain work was automatically replayed'; END IF;
  SELECT * INTO claimed FROM public.meta_conversion_events WHERE id = event_b;
  IF claimed.status <> 'failed' OR claimed.error_code <> 'lease_expired' OR claimed.failure_kind <> 'uncertain' OR claimed.next_attempt_at IS NOT NULL THEN
    RAISE EXCEPTION 'Expired lease was not stopped for administrator review';
  END IF;
  SELECT count(*) INTO row_count FROM public.meta_conversion_delivery_attempts WHERE id = second_lease AND status = 'failed' AND error_code = 'lease_expired';
  IF row_count <> 1 THEN RAISE EXCEPTION 'Expired lease history was not recorded'; END IF;

  -- Manual requeue still requires current consent; withdrawal wins before claiming.
  PERFORM public.request_meta_conversion_retry(org_b,event_b);
  PERFORM public.record_meta_consent(org_b,lead_b,false,false,'Notice v1','phase4-withdrawal','IN','withdrawal',false,true,actor);
  SELECT * INTO claimed FROM public.meta_conversion_events WHERE id = event_b;
  IF claimed.status <> 'blocked' OR claimed.error_code <> 'consent_withdrawn' THEN RAISE EXCEPTION 'Withdrawal did not block a manually retried event'; END IF;
  SELECT count(*) INTO row_count FROM public.claim_meta_conversion_events(1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'Withdrawn or test-only event was claimed'; END IF;

  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE id IN (event_a,event_b,event_test) AND (status = 'sent' OR provider_received_at IS NOT NULL);
  IF row_count <> 0 THEN RAISE EXCEPTION 'Rollback tests unexpectedly recorded a Meta receipt'; END IF;
END;
$phase4$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"0b9ef4c7-6620-4a16-a0b5-dfb7869e00ea"}';

DO $phase4_rls$
DECLARE
  visible_events integer;
  visible_attempts integer;
BEGIN
  SELECT count(*) INTO visible_events FROM public.meta_conversion_events;
  IF visible_events <> 1 THEN RAISE EXCEPTION 'Workspace A administrator saw % events instead of 1', visible_events; END IF;
  SELECT count(*) INTO visible_attempts FROM public.meta_conversion_delivery_attempts;
  IF visible_attempts <> 3 THEN RAISE EXCEPTION 'Workspace A administrator saw % attempts instead of 3', visible_attempts; END IF;
END;
$phase4_rls$;

ROLLBACK;
