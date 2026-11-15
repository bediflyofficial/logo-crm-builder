ALTER TABLE public.meta_integration_settings ADD COLUMN assignment_cursor bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.claim_meta_lead_jobs(_limit integer DEFAULT 5) RETURNS SETOF public.meta_webhook_events LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.meta_webhook_events e SET processing_status='processing', attempts=e.attempts+1, lease_until=now()+interval '2 minutes'
 WHERE e.id IN (SELECT id FROM public.meta_webhook_events WHERE ((processing_status IN ('pending','failed') AND next_attempt_at<=now()) OR (processing_status='processing' AND lease_until<now())) AND attempts<8 ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(_limit,1),10)) RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.claim_meta_lead_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meta_lead_jobs(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.ingest_meta_lead(_job_id uuid,_attempt integer,_organization_id uuid,_lead jsonb,_fields jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_webhook_events; s public.meta_integration_settings; f public.meta_assets; p public.meta_assets; result_id uuid; execs uuid[]; assignee uuid; recipient uuid; duplicate_contact boolean; created boolean:=false;
BEGIN
 SELECT * INTO j FROM public.meta_webhook_events WHERE id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.processing_status<>'processing' OR j.attempts<>_attempt OR j.lease_until<now() THEN RAISE EXCEPTION 'Job lease unavailable'; END IF;
 SELECT * INTO f FROM public.meta_assets WHERE organization_id=_organization_id AND asset_type='form' AND external_id=j.form_id AND parent_external_id=j.page_id AND selected FOR UPDATE;
 SELECT * INTO p FROM public.meta_assets WHERE organization_id=_organization_id AND asset_type='page' AND external_id=j.page_id AND selected AND webhook_subscribed FOR UPDATE;
 IF f.id IS NULL OR p.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.meta_connections WHERE id=f.connection_id AND organization_id=_organization_id AND connection_status='connected' AND (token_expires_at IS NULL OR token_expires_at>now())) OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=_organization_id AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Selected client form unavailable'; END IF;
 INSERT INTO public.meta_integration_settings(organization_id) VALUES(_organization_id) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.meta_integration_settings WHERE organization_id=_organization_id FOR UPDATE;
 SELECT id INTO result_id FROM public.leads WHERE organization_id=_organization_id AND meta_lead_id=j.leadgen_id;
 IF result_id IS NULL THEN
  SELECT array_agg(m.user_id ORDER BY array_position(s.executive_ids,m.user_id)) INTO execs FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.is_active AND m.user_id=ANY(s.executive_ids) AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.organization_id=m.organization_id AND r.user_id=m.user_id AND r.role='sales_exec');
  IF s.assignment_mode='fixed' AND cardinality(execs)=1 THEN assignee:=execs[1]; END IF;
  IF s.assignment_mode='round_robin' AND cardinality(execs)>0 THEN assignee:=execs[(s.assignment_cursor % cardinality(execs))+1]; UPDATE public.meta_integration_settings SET assignment_cursor=assignment_cursor+1 WHERE organization_id=_organization_id; END IF;
  SELECT EXISTS(SELECT 1 FROM public.leads WHERE organization_id=_organization_id AND deleted_at IS NULL AND ((nullif(_lead->>'phone','') IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(_lead->>'phone','[^0-9]','','g')) OR (nullif(_lead->>'email','') IS NOT NULL AND lower(email)=lower(_lead->>'email')))) INTO duplicate_contact;
  INSERT INTO public.leads(organization_id,full_name,phone,email,city,state,country,source,form_name,source_reference_id,lead_created_at,status,quality,assigned_to,meta_lead_id,meta_page_id,meta_form_id,meta_ad_id,meta_campaign_id,meta_ad_set_id,meta_ad_account_id,campaign_name,ad_set_name,ad_name)
  VALUES(_organization_id,coalesce(nullif(_lead->>'full_name',''),'Unnamed Meta lead'),nullif(_lead->>'phone',''),nullif(_lead->>'email',''),nullif(_lead->>'city',''),nullif(_lead->>'state',''),nullif(_lead->>'country',''),'Meta Lead Ads',f.name,j.leadgen_id,(_lead->>'created_time')::timestamptz,CASE WHEN s.duplicate_handling='flag' AND duplicate_contact THEN 'Duplicate' ELSE s.default_status END,s.default_quality,assignee,j.leadgen_id,j.page_id,j.form_id,_lead->>'ad_id',_lead->>'campaign_id',_lead->>'adset_id',_lead->>'ad_account_id',_lead->>'campaign_name',_lead->>'adset_name',_lead->>'ad_name') RETURNING id INTO result_id;
  INSERT INTO public.meta_lead_responses(lead_id,organization_id,field_data) VALUES(result_id,_organization_id,_fields);
  INSERT INTO public.lead_activities(organization_id,lead_id,activity_type,description) VALUES(_organization_id,result_id,'meta_import','Lead received from selected Meta Instant Form');
  IF s.notifications_enabled THEN
   IF assignee IS NOT NULL THEN INSERT INTO public.notifications(organization_id,user_id,kind,title,body) VALUES(_organization_id,assignee,'meta_lead','New Meta lead','A Meta lead has been assigned to you.');
   ELSE FOR recipient IN SELECT m.user_id FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.is_active AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.organization_id=m.organization_id AND r.user_id=m.user_id AND r.role='client_admin') LOOP INSERT INTO public.notifications(organization_id,user_id,kind,title,body) VALUES(_organization_id,recipient,'meta_lead','Unassigned Meta lead','A new Meta lead is waiting for assignment.'); END LOOP; END IF;
  END IF;
  created:=true;
 END IF;
 UPDATE public.meta_webhook_events SET organization_id=_organization_id,processing_status='succeeded',processed_at=now(),lease_until=NULL,error_code=NULL WHERE id=j.id;
 UPDATE public.meta_connections SET last_sync_at=now() WHERE id=f.connection_id AND organization_id=_organization_id;
 INSERT INTO public.meta_sync_logs(organization_id,connection_id,sync_type,status,records_processed) VALUES(_organization_id,f.connection_id,'lead_import','succeeded',CASE WHEN created THEN 1 ELSE 0 END);
 RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_meta_lead(uuid,integer,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_meta_lead(uuid,integer,uuid,jsonb,jsonb) TO service_role;