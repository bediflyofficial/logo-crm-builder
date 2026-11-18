BEGIN;

DO $phase5$
DECLARE
  org_a constant uuid := 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  org_b constant uuid := 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  lead_a constant uuid := '50000001-0000-4000-8000-000000000001';
  lead_b constant uuid := '50000001-0000-4000-8000-000000000002';
  analytics jsonb;
  row_count integer;
BEGIN
  INSERT INTO public.organizations (id,name) VALUES
    (org_a,'Phase 5 rollback analytics A'),
    (org_b,'Phase 5 rollback analytics B');
  INSERT INTO public.leads (id,organization_id,full_name,status,quality) VALUES
    (lead_a,org_a,'Analytics lead A','New Lead','Warm'),
    (lead_b,org_b,'Analytics lead B','New Lead','Warm');

  INSERT INTO public.meta_conversion_events (id,organization_id,lead_id,event_name,outcome_reference,occurred_at,action_source,status,created_at,value,currency,test_event,next_attempt_at,failure_kind) VALUES
    ('60000001-0000-4000-8000-000000000001',org_a,lead_a,'QualifiedLead','a:sent','2026-11-10 10:00+00','system_generated','sent','2026-11-10 11:00+00',NULL,NULL,false,NULL,NULL),
    ('60000001-0000-4000-8000-000000000002',org_a,lead_a,'QualifiedLead','a:failed','2026-11-11 10:00+00','system_generated','failed','2026-11-11 11:00+00',NULL,NULL,false,NULL,'uncertain'),
    ('60000001-0000-4000-8000-000000000003',org_a,lead_a,'Purchase','a:pending','2026-11-12 10:00+00','system_generated','pending','2026-11-12 11:00+00',125.50,'INR',false,NULL,NULL),
    ('60000001-0000-4000-8000-000000000004',org_a,lead_a,'Purchase','a:blocked','2026-11-13 10:00+00','system_generated','blocked','2026-11-13 11:00+00',NULL,NULL,false,NULL,NULL),
    ('60000001-0000-4000-8000-000000000005',org_a,lead_a,'QualifiedLead','a:test','2026-11-14 10:00+00','system_generated','sent','2026-11-14 11:00+00',NULL,NULL,true,NULL,NULL),
    ('60000001-0000-4000-8000-000000000006',org_a,lead_a,'QualifiedLead','a:old','2025-10-31 10:00+00','system_generated','sent','2025-10-31 11:00+00',NULL,NULL,false,NULL,NULL),
    ('60000001-0000-4000-8000-000000000007',org_b,lead_b,'QualifiedLead','b:retry','2026-11-15 10:00+00','system_generated','failed','2026-11-15 11:00+00',NULL,NULL,false,'2026-11-16 11:00+00','temporary'),
    ('60000001-0000-4000-8000-000000000008',org_b,lead_b,'Purchase','b:sent','2026-11-16 10:00+00','system_generated','sent','2026-11-16 11:00+00',200.00,'INR',false,NULL,NULL);

  -- Workspace A production totals and rates.
  analytics := public.meta_conversion_analytics(org_a,'2026-11-01 00:00+00','2026-12-01 00:00+00',NULL,'production');
  IF (analytics->'summary'->>'eventsCreated')::integer <> 4
    OR (analytics->'summary'->>'qualifiedLead')::integer <> 2
    OR (analytics->'summary'->>'purchase')::integer <> 2
    OR (analytics->'summary'->>'pending')::integer <> 1
    OR (analytics->'summary'->>'delivered')::integer <> 1
    OR (analytics->'summary'->>'blocked')::integer <> 1
    OR (analytics->'summary'->>'failed')::integer <> 1
    OR (analytics->'summary'->>'manualReview')::integer <> 1
    OR (analytics->'summary'->>'productionEvents')::integer <> 4
    OR (analytics->'summary'->>'testEvents')::integer <> 0
    OR (analytics->'summary'->>'deliverySuccessRate')::numeric <> 50
    OR (analytics->'summary'->>'failureRate')::numeric <> 50 THEN
    RAISE EXCEPTION 'Workspace A analytics totals are inaccurate: %', analytics;
  END IF;
  IF jsonb_array_length(analytics->'byType') <> 2 OR jsonb_array_length(analytics->'trend') <> 4 OR jsonb_array_length(analytics->'workspaces') <> 0 THEN
    RAISE EXCEPTION 'Workspace breakdown or daily trend is inaccurate';
  END IF;

  -- Test events are reported separately and never inflate production delivery.
  analytics := public.meta_conversion_analytics(org_a,'2026-11-01 00:00+00','2026-12-01 00:00+00',NULL,'test');
  IF (analytics->'summary'->>'eventsCreated')::integer <> 1
    OR (analytics->'summary'->>'testEvents')::integer <> 1
    OR (analytics->'summary'->>'productionEvents')::integer <> 0
    OR (analytics->'summary'->>'delivered')::integer <> 1 THEN
    RAISE EXCEPTION 'Test event separation is inaccurate';
  END IF;

  -- Event type and narrow date filters are applied together.
  analytics := public.meta_conversion_analytics(org_a,'2026-11-10 00:00+00','2026-11-11 00:00+00','QualifiedLead','production');
  IF (analytics->'summary'->>'eventsCreated')::integer <> 1 OR (analytics->'summary'->>'delivered')::integer <> 1 THEN
    RAISE EXCEPTION 'Date or event-type filter is inaccurate';
  END IF;

  -- Super Admin aggregation includes both workspaces; manual review excludes scheduled retry.
  analytics := public.meta_conversion_analytics(NULL,'2026-11-01 00:00+00','2026-12-01 00:00+00',NULL,'production');
  IF (analytics->'summary'->>'eventsCreated')::integer <> 6
    OR (analytics->'summary'->>'delivered')::integer <> 2
    OR (analytics->'summary'->>'failed')::integer <> 2
    OR (analytics->'summary'->>'manualReview')::integer <> 1
    OR jsonb_array_length(analytics->'workspaces') <> 2 THEN
    RAISE EXCEPTION 'Super Admin aggregation is inaccurate: %', analytics;
  END IF;

  -- Empty ranges return zeroes, null rates and no chart/workspace rows.
  analytics := public.meta_conversion_analytics(org_a,'2024-01-01 00:00+00','2024-02-01 00:00+00',NULL,'production');
  IF (analytics->'summary'->>'eventsCreated')::integer <> 0
    OR analytics->'summary'->'deliverySuccessRate' <> 'null'::jsonb
    OR analytics->'summary'->'failureRate' <> 'null'::jsonb
    OR jsonb_array_length(analytics->'byType') <> 0
    OR jsonb_array_length(analytics->'trend') <> 0 THEN
    RAISE EXCEPTION 'Empty analytics state is inaccurate';
  END IF;

  SELECT count(*) INTO row_count FROM public.meta_conversion_events WHERE organization_id IN (org_a,org_b) AND provider_received_at IS NOT NULL;
  IF row_count <> 0 THEN RAISE EXCEPTION 'Analytics fixtures unexpectedly contain live Meta receipts'; END IF;
END;
$phase5$;

-- Browser roles cannot bypass the authorized API and call the aggregate function directly.
SET LOCAL ROLE authenticated;
DO $phase5_grants$
BEGIN
  BEGIN
    PERFORM public.meta_conversion_analytics(NULL,'2026-11-01 00:00+00','2026-12-01 00:00+00',NULL,'production');
    RAISE EXCEPTION 'Authenticated browser role executed analytics directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$phase5_grants$;

ROLLBACK;
