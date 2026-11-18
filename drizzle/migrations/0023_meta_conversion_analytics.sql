CREATE FUNCTION public.meta_conversion_analytics(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz,
  _event_name text,
  _test_mode text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to <= _from OR _to - _from > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid analytics date range';
  END IF;
  IF _event_name IS NOT NULL AND _event_name NOT IN ('QualifiedLead','Purchase') THEN
    RAISE EXCEPTION 'Invalid conversion event type';
  END IF;
  IF _test_mode NOT IN ('production','test','all') THEN
    RAISE EXCEPTION 'Invalid analytics delivery mode';
  END IF;

  WITH filtered AS (
    SELECT e.*, o.name AS organization_name
    FROM public.meta_conversion_events e
    JOIN public.organizations o ON o.id = e.organization_id AND o.deleted_at IS NULL
    WHERE (_organization_id IS NULL OR e.organization_id = _organization_id)
      AND e.created_at >= _from AND e.created_at < _to
      AND (_event_name IS NULL OR e.event_name = _event_name)
      AND (
        _test_mode = 'all'
        OR (_test_mode = 'test' AND e.test_event)
        OR (_test_mode = 'production' AND NOT e.test_event)
      )
  ),
  summary AS (
    SELECT jsonb_build_object(
      'eventsCreated', count(*),
      'pending', count(*) FILTER (WHERE status IN ('pending','processing')),
      'delivered', count(*) FILTER (WHERE status = 'sent'),
      'blocked', count(*) FILTER (WHERE status = 'blocked'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'manualReview', count(*) FILTER (WHERE status = 'failed' AND next_attempt_at IS NULL),
      'qualifiedLead', count(*) FILTER (WHERE event_name = 'QualifiedLead'),
      'purchase', count(*) FILTER (WHERE event_name = 'Purchase'),
      'productionEvents', count(*) FILTER (WHERE NOT test_event),
      'testEvents', count(*) FILTER (WHERE test_event),
      'deliverySuccessRate', round(100.0 * count(*) FILTER (WHERE status = 'sent') / nullif(count(*) FILTER (WHERE status IN ('sent','failed')),0),1),
      'failureRate', round(100.0 * count(*) FILTER (WHERE status = 'failed') / nullif(count(*) FILTER (WHERE status IN ('sent','failed')),0),1)
    ) AS value FROM filtered
  ),
  by_type AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'eventName', event_name,
      'environment', CASE WHEN test_event THEN 'test' ELSE 'production' END,
      'eventsCreated', events_created,
      'pending', pending,
      'delivered', delivered,
      'blocked', blocked,
      'failed', failed,
      'manualReview', manual_review
    ) ORDER BY event_name, environment),'[]'::jsonb) AS value
    FROM (
      SELECT event_name, test_event, count(*) AS events_created,
        count(*) FILTER (WHERE status IN ('pending','processing')) AS pending,
        count(*) FILTER (WHERE status = 'sent') AS delivered,
        count(*) FILTER (WHERE status = 'blocked') AS blocked,
        count(*) FILTER (WHERE status = 'failed') AS failed,
        count(*) FILTER (WHERE status = 'failed' AND next_attempt_at IS NULL) AS manual_review
      FROM filtered GROUP BY event_name, test_event
    ) grouped
  ),
  trend AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(day,'YYYY-MM-DD'),
      'qualifiedLead', qualified_lead,
      'purchase', purchase,
      'pending', pending,
      'delivered', delivered,
      'blocked', blocked,
      'failed', failed
    ) ORDER BY day),'[]'::jsonb) AS value
    FROM (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
        count(*) FILTER (WHERE event_name = 'QualifiedLead') AS qualified_lead,
        count(*) FILTER (WHERE event_name = 'Purchase') AS purchase,
        count(*) FILTER (WHERE status IN ('pending','processing')) AS pending,
        count(*) FILTER (WHERE status = 'sent') AS delivered,
        count(*) FILTER (WHERE status = 'blocked') AS blocked,
        count(*) FILTER (WHERE status = 'failed') AS failed
      FROM filtered GROUP BY day
    ) daily
  ),
  workspaces AS (
    SELECT CASE WHEN _organization_id IS NULL THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'organizationId', organization_id,
        'organizationName', organization_name,
        'eventsCreated', events_created,
        'pending', pending,
        'delivered', delivered,
        'blocked', blocked,
        'failed', failed,
        'manualReview', manual_review,
        'deliverySuccessRate', round(100.0 * delivered / nullif(delivered + failed,0),1),
        'failureRate', round(100.0 * failed / nullif(delivered + failed,0),1)
      ) ORDER BY organization_name)
      FROM (
        SELECT organization_id, organization_name, count(*) AS events_created,
          count(*) FILTER (WHERE status IN ('pending','processing')) AS pending,
          count(*) FILTER (WHERE status = 'sent') AS delivered,
          count(*) FILTER (WHERE status = 'blocked') AS blocked,
          count(*) FILTER (WHERE status = 'failed') AS failed,
          count(*) FILTER (WHERE status = 'failed' AND next_attempt_at IS NULL) AS manual_review
        FROM filtered GROUP BY organization_id, organization_name
      ) grouped
    ),'[]'::jsonb) ELSE '[]'::jsonb END AS value
  )
  SELECT jsonb_build_object(
    'summary', (SELECT value FROM summary),
    'byType', (SELECT value FROM by_type),
    'trend', (SELECT value FROM trend),
    'workspaces', (SELECT value FROM workspaces)
  ) INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.meta_conversion_analytics(uuid,timestamptz,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_conversion_analytics(uuid,timestamptz,timestamptz,text,text) TO service_role;
COMMENT ON FUNCTION public.meta_conversion_analytics(uuid,timestamptz,timestamptz,text,text) IS 'Server-only aggregate analytics over the existing conversion outbox; authorized API checks platform or workspace-admin access before calling. Test and production events remain distinct.';