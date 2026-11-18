BEGIN;

DO $phase2$
DECLARE
  org_a constant uuid := 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  org_b constant uuid := 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  actor constant uuid := '0b9ef4c7-6620-4a16-a0b5-dfb7869e00ea';
  missing_lead constant uuid := '10000001-0000-4000-8000-000000000001';
  granted_lead constant uuid := '10000001-0000-4000-8000-000000000002';
  bulk_one constant uuid := '10000001-0000-4000-8000-000000000003';
  bulk_two constant uuid := '10000001-0000-4000-8000-000000000004';
  quality_lead constant uuid := '10000001-0000-4000-8000-000000000005';
  purchase_lead constant uuid := '10000001-0000-4000-8000-000000000006';
  matching_lead constant uuid := '10000001-0000-4000-8000-000000000007';
  gpc_lead constant uuid := '10000001-0000-4000-8000-000000000008';
  other_workspace_lead constant uuid := '10000001-0000-4000-8000-000000000009';
  missing_purchase_value constant uuid := '10000001-0000-4000-8000-000000000010';
  event public.meta_conversion_events;
  original_id uuid;
  original_time timestamptz;
  original_value numeric;
  row_count integer;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (org_a, 'Phase 2 rollback test A'),
    (org_b, 'Phase 2 rollback test B');
  INSERT INTO public.organization_members (organization_id, user_id, full_name, is_active) VALUES
    (org_a, actor, 'Rollback admin', true),
    (org_b, actor, 'Rollback executive', true);
  INSERT INTO public.user_roles (organization_id, user_id, role) VALUES
    (org_a, actor, 'client_admin'),
    (org_b, actor, 'sales_exec');

  UPDATE public.meta_conversion_rules SET enabled = true
    WHERE organization_id IN (org_a, org_b) AND trigger_type = 'status' AND trigger_value = 'Qualified';
  UPDATE public.meta_conversion_rules SET enabled = true, currency = 'INR'
    WHERE organization_id = org_a AND trigger_type = 'status' AND trigger_value = 'Converted';
  INSERT INTO public.meta_conversion_rules (organization_id, trigger_type, trigger_value, event_name, enabled)
    VALUES (org_a, 'quality', 'Hot', 'QualifiedLead', true);

  INSERT INTO public.leads (id, organization_id, full_name, status, quality, lead_value, assigned_to) VALUES
    (missing_lead, org_a, 'Missing consent', 'New Lead', 'Warm', NULL, NULL),
    (granted_lead, org_a, 'Granted consent', 'New Lead', 'Warm', NULL, NULL),
    (bulk_one, org_a, 'Bulk one', 'New Lead', 'Warm', NULL, NULL),
    (bulk_two, org_a, 'Bulk two', 'New Lead', 'Warm', NULL, NULL),
    (quality_lead, org_a, 'Quality trigger', 'New Lead', 'Warm', NULL, NULL),
    (purchase_lead, org_a, 'Purchase trigger', 'New Lead', 'Warm', 1250.00, NULL),
    (matching_lead, org_a, 'Matching refused', 'New Lead', 'Warm', NULL, NULL),
    (gpc_lead, org_a, 'Privacy signal', 'New Lead', 'Warm', NULL, NULL),
    (other_workspace_lead, org_b, 'Other workspace', 'New Lead', 'Warm', NULL, actor),
    (missing_purchase_value, org_a, 'Missing Purchase value', 'New Lead', 'Warm', NULL, NULL);

  PERFORM public.record_meta_consent(org_a, granted_lead, true, true, 'Notice v1', 'grant-evidence', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, bulk_one, true, true, 'Notice v1', 'bulk-1', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, bulk_two, true, true, 'Notice v1', 'bulk-2', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, quality_lead, true, true, 'Notice v1', 'quality', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, purchase_lead, true, true, 'Notice v1', 'purchase', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, matching_lead, true, false, 'Notice v1', 'matching-refused', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, gpc_lead, false, false, 'Notice v1', 'gpc-signal', 'US-CA', 'global_privacy_control', true, false, actor);
  PERFORM public.record_meta_consent(org_b, other_workspace_lead, true, true, 'Notice v1', 'workspace-b', 'IN', 'customer_form', false, false, actor);
  PERFORM public.record_meta_consent(org_a, missing_purchase_value, true, true, 'Notice v1', 'purchase-missing-value', 'IN', 'customer_form', false, false, actor);

  -- Consent missing.
  UPDATE public.leads SET status = 'Qualified' WHERE id = missing_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = missing_lead;
  IF event.status <> 'blocked' OR event.error_code <> 'consent_missing' OR event.consent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Missing consent was not blocked correctly';
  END IF;

  -- Consent granted and stable event identity.
  UPDATE public.leads SET status = 'Qualified' WHERE id = granted_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = granted_lead;
  IF event.status <> 'pending' OR event.consent_id IS NULL OR event.outcome_reference <> 'lead:' || granted_lead::text THEN
    RAISE EXCEPTION 'Granted consent did not create a pending outbox event';
  END IF;
  original_id := event.id;
  original_time := event.occurred_at;

  -- Repeated status selector/pipeline updates never replace the original event.
  UPDATE public.leads SET status = 'Qualified' WHERE id = granted_lead;
  UPDATE public.leads SET status = 'Contacted' WHERE id = granted_lead;
  UPDATE public.leads SET status = 'Qualified' WHERE id = granted_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = granted_lead;
  IF event.id <> original_id OR event.occurred_at <> original_time THEN
    RAISE EXCEPTION 'Repeated transitions changed the stable event ID or timestamp';
  END IF;
  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE lead_id = granted_lead AND event_name = 'QualifiedLead';
  IF row_count <> 1 THEN RAISE EXCEPTION 'Duplicate QualifiedLead event created'; END IF;

  -- Bulk status updates use the same trigger.
  UPDATE public.leads SET status = 'Qualified' WHERE id IN (bulk_one, bulk_two);
  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE lead_id IN (bulk_one, bulk_two) AND status = 'pending';
  IF row_count <> 2 THEN RAISE EXCEPTION 'Bulk update did not create two pending events'; END IF;

  -- A later Global Privacy Control signal also blocks already-pending work.
  PERFORM public.record_meta_consent(org_a, bulk_one, false, false, 'Notice v1', 'late-gpc', 'US-CA', 'global_privacy_control', true, false, actor);
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = bulk_one;
  IF event.status <> 'blocked' OR event.error_code <> 'global_privacy_control' THEN RAISE EXCEPTION 'Late Global Privacy Control did not block pending work'; END IF;
  event := public.recheck_meta_conversion_consent(event.id);
  IF event.status <> 'blocked' THEN RAISE EXCEPTION 'Privacy recheck allowed a GPC-blocked event'; END IF;

  -- Quality changes and conditional Purchase data.
  UPDATE public.leads SET quality = 'Hot' WHERE id = quality_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = quality_lead;
  IF event.status <> 'pending' OR event.event_name <> 'QualifiedLead' THEN RAISE EXCEPTION 'Quality trigger failed'; END IF;

  UPDATE public.leads SET status = 'Converted' WHERE id = purchase_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = purchase_lead;
  IF event.status <> 'pending' OR event.value <> 1250.00 OR event.currency <> 'INR' THEN
    RAISE EXCEPTION 'Purchase value or currency was not captured';
  END IF;
  original_id := event.id;
  original_time := event.occurred_at;
  original_value := event.value;
  UPDATE public.leads SET lead_value = 9999.00 WHERE id = purchase_lead;
  UPDATE public.leads SET status = 'New Lead' WHERE id = purchase_lead;
  UPDATE public.leads SET status = 'Converted' WHERE id = purchase_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = purchase_lead;
  IF event.id <> original_id OR event.occurred_at <> original_time OR event.value <> original_value THEN
    RAISE EXCEPTION 'Later edits changed the original Purchase event';
  END IF;

  UPDATE public.leads SET status = 'Converted' WHERE id = missing_purchase_value;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = missing_purchase_value;
  IF event.status <> 'blocked' OR event.error_code <> 'purchase_value_required' THEN RAISE EXCEPTION 'Missing Purchase value was not blocked'; END IF;

  -- Matching-data refusal and Global Privacy Control.
  UPDATE public.leads SET status = 'Qualified' WHERE id = matching_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = matching_lead;
  IF event.status <> 'blocked' OR event.error_code <> 'matching_consent_required' THEN RAISE EXCEPTION 'Matching refusal was not blocked'; END IF;

  UPDATE public.leads SET status = 'Qualified' WHERE id = gpc_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = gpc_lead;
  IF event.status <> 'blocked' OR event.error_code <> 'global_privacy_control' THEN RAISE EXCEPTION 'Global Privacy Control was not blocked'; END IF;

  -- A second workspace gets its own independent outbox row.
  UPDATE public.leads SET status = 'Qualified' WHERE id = other_workspace_lead;
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = other_workspace_lead AND organization_id = org_b;
  IF event.status <> 'pending' THEN RAISE EXCEPTION 'Second workspace event was not created'; END IF;
  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE organization_id = org_a;
  IF row_count <> 9 THEN RAISE EXCEPTION 'Unexpected workspace A event count: %', row_count; END IF;
  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE organization_id = org_b;
  IF row_count <> 1 THEN RAISE EXCEPTION 'Unexpected workspace B event count: %', row_count; END IF;

  -- Withdrawal immediately blocks pending work and a later acceptance never replays it.
  PERFORM public.record_meta_consent(org_a, granted_lead, false, false, 'Notice v1', 'withdrawal-evidence', 'IN', 'withdrawal', false, true, actor);
  SELECT * INTO event FROM public.meta_conversion_events WHERE lead_id = granted_lead;
  IF event.status <> 'blocked' OR event.error_code <> 'consent_withdrawn' THEN RAISE EXCEPTION 'Withdrawal did not block the pending event'; END IF;
  event := public.recheck_meta_conversion_consent(event.id);
  IF event.status <> 'blocked' THEN RAISE EXCEPTION 'Consent recheck allowed a withdrawn event'; END IF;
  PERFORM public.record_meta_consent(org_a, granted_lead, true, true, 'Notice v1', 'later-grant', 'IN', 'customer_form', false, false, actor);
  event := public.recheck_meta_conversion_consent(event.id);
  IF event.status <> 'blocked' THEN RAISE EXCEPTION 'Later consent replayed a blocked historical event'; END IF;

  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE organization_id IN (org_a, org_b) AND (status = 'sent' OR provider_received_at IS NOT NULL);
  IF row_count <> 0 THEN RAISE EXCEPTION 'Phase 2 unexpectedly transmitted an event'; END IF;
END;
$phase2$;

-- RLS check as a user who is client administrator in A and sales executive in B.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"0b9ef4c7-6620-4a16-a0b5-dfb7869e00ea"}';

DO $phase2_rls$
DECLARE
  org_b constant uuid := 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  other_workspace_lead constant uuid := '10000001-0000-4000-8000-000000000009';
  visible_events integer;
  visible_consents integer;
BEGIN
  SELECT count(*) INTO visible_events FROM public.meta_conversion_events;
  IF visible_events <> 9 THEN RAISE EXCEPTION 'Workspace A administrator saw % events instead of 9', visible_events; END IF;
  SELECT count(*) INTO visible_consents FROM public.meta_consent_evidence;
  IF visible_consents <> 11 THEN RAISE EXCEPTION 'Workspace A administrator saw % consent rows instead of 11', visible_consents; END IF;
  IF public.is_org_admin(org_b) THEN RAISE EXCEPTION 'Sales executive was treated as workspace B administrator'; END IF;

  -- Assigned sales executive can change lead status, but still cannot read the B outbox.
  UPDATE public.leads SET status = 'Contacted' WHERE id = other_workspace_lead;
  SELECT count(*) INTO visible_events FROM public.meta_conversion_events;
  IF visible_events <> 9 THEN RAISE EXCEPTION 'Sales executive could read another workspace outbox'; END IF;

  BEGIN
    INSERT INTO public.meta_consent_evidence (
      organization_id, lead_id, advertising_accepted, matching_accepted,
      notice_version, evidence_reference, region
    ) VALUES (
      org_b, other_workspace_lead, true, true, 'Notice v1', 'unauthorized', 'IN'
    );
    RAISE EXCEPTION 'Sales executive inserted consent evidence directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$phase2_rls$;

ROLLBACK;
