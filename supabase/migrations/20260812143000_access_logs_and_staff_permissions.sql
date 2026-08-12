CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1
    FROM public.page_permissions
    WHERE user_id = _user_id
      AND can_view = true
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_page(_user_id uuid, _page text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1
    FROM public.page_permissions
    WHERE user_id = _user_id
      AND page = _page
      AND can_view = true
      AND can_edit = true
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_super boolean;
  normalized_email text;
BEGIN
  normalized_email := lower(COALESCE(NEW.email, ''));

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  IF normalized_email = 'yvette@triaconsultingus.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role), (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) INTO has_super;
  IF NOT has_super THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role), (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system logs read super admin" ON public.system_logs;
CREATE POLICY "system logs read super admin"
ON public.system_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "system logs insert staff" ON public.system_logs;
CREATE POLICY "system logs insert staff"
ON public.system_logs FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_report_upload_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid;
  actor_mail text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor := COALESCE(auth.uid(), NEW.uploaded_by);
  ELSIF TG_OP = 'UPDATE' THEN
    actor := COALESCE(auth.uid(), NEW.uploaded_by, OLD.uploaded_by);
  ELSE
    actor := COALESCE(auth.uid(), OLD.uploaded_by);
  END IF;

  SELECT email INTO actor_mail FROM auth.users WHERE id = actor;

  INSERT INTO public.system_logs (actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
  VALUES (
    actor,
    actor_mail,
    lower(TG_OP),
    'report_upload',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END::text,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Uploaded ' || COALESCE(NEW.file_name, 'a report')
      WHEN TG_OP = 'DELETE' THEN 'Deleted ' || COALESCE(OLD.file_name, 'a report')
      ELSE 'Updated ' || COALESCE(NEW.file_name, OLD.file_name, 'a report')
    END,
    jsonb_build_object(
      'kind', CASE WHEN TG_OP = 'DELETE' THEN OLD.kind::text ELSE NEW.kind::text END,
      'file_name', CASE WHEN TG_OP = 'DELETE' THEN OLD.file_name ELSE NEW.file_name END,
      'row_count', CASE WHEN TG_OP = 'DELETE' THEN OLD.row_count ELSE NEW.row_count END,
      'status', CASE WHEN TG_OP = 'DELETE' THEN OLD.status ELSE NEW.status END,
      'effective_from', CASE WHEN TG_OP = 'DELETE' THEN OLD.effective_from ELSE NEW.effective_from END,
      'effective_to', CASE WHEN TG_OP = 'DELETE' THEN OLD.effective_to ELSE NEW.effective_to END
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_uploads_system_log ON public.report_uploads;
CREATE TRIGGER report_uploads_system_log
AFTER INSERT OR UPDATE OR DELETE ON public.report_uploads
FOR EACH ROW EXECUTE FUNCTION public.log_report_upload_change();

CREATE OR REPLACE FUNCTION public.log_new_user_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.system_logs (actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
  VALUES (
    NEW.id,
    NEW.email,
    'signup_pending_approval',
    'user',
    NEW.id::text,
    'New account waiting for access approval: ' || COALESCE(NEW.email, NEW.id::text),
    jsonb_build_object('email', NEW.email)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_signup_system_log ON auth.users;
CREATE TRIGGER auth_users_signup_system_log
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.log_new_user_signup();

CREATE OR REPLACE FUNCTION public.log_page_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_mail text;
  target_mail text;
  should_log boolean;
BEGIN
  SELECT email INTO actor_mail FROM auth.users WHERE id = NEW.updated_by;
  SELECT email INTO target_mail FROM auth.users WHERE id = NEW.user_id;
  IF TG_OP = 'INSERT' THEN
    should_log := true;
  ELSE
    should_log := NEW.can_view IS DISTINCT FROM OLD.can_view
      OR NEW.can_edit IS DISTINCT FROM OLD.can_edit;
  END IF;

  IF should_log THEN
    INSERT INTO public.system_logs (actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (
      NEW.updated_by,
      actor_mail,
      CASE WHEN NEW.can_view THEN 'access_granted' ELSE 'access_blocked' END,
      'page_permission',
      NEW.user_id::text,
      COALESCE(target_mail, NEW.user_id::text) || ' ' ||
        CASE WHEN NEW.can_view THEN 'was granted access to ' ELSE 'was blocked from ' END ||
        NEW.page,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_email', target_mail,
        'page', NEW.page,
        'can_view', NEW.can_view,
        'can_edit', NEW.can_edit
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS page_permissions_system_log ON public.page_permissions;
CREATE TRIGGER page_permissions_system_log
AFTER INSERT OR UPDATE ON public.page_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_page_permission_change();

DROP POLICY IF EXISTS "customers read auth" ON public.customers;
DROP POLICY IF EXISTS "customers admin write" ON public.customers;
DROP POLICY IF EXISTS "customers admin update" ON public.customers;
DROP POLICY IF EXISTS "customers admin delete" ON public.customers;

CREATE POLICY "customers read staff"
ON public.customers FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "customers write editors"
ON public.customers FOR INSERT TO authenticated
WITH CHECK (public.can_edit_page(auth.uid(), 'customers'));

CREATE POLICY "customers update editors"
ON public.customers FOR UPDATE TO authenticated
USING (public.can_edit_page(auth.uid(), 'customers'))
WITH CHECK (public.can_edit_page(auth.uid(), 'customers'));

CREATE POLICY "customers delete editors"
ON public.customers FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'customers'));

DROP POLICY IF EXISTS "uploads read auth" ON public.report_uploads;
DROP POLICY IF EXISTS "uploads insert auth" ON public.report_uploads;
DROP POLICY IF EXISTS "uploads delete admin" ON public.report_uploads;
DROP POLICY IF EXISTS "uploads update own or admin" ON public.report_uploads;

CREATE POLICY "uploads read staff"
ON public.report_uploads FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "uploads insert editors"
ON public.report_uploads FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "uploads delete editors"
ON public.report_uploads FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "uploads update editors"
ON public.report_uploads FOR UPDATE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'))
WITH CHECK (public.can_edit_page(auth.uid(), 'uploads'));

DROP POLICY IF EXISTS "tickets read auth" ON public.tickets;
DROP POLICY IF EXISTS "tickets insert auth" ON public.tickets;
DROP POLICY IF EXISTS "tickets delete admin" ON public.tickets;

CREATE POLICY "tickets read staff"
ON public.tickets FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "tickets insert upload editors"
ON public.tickets FOR INSERT TO authenticated
WITH CHECK (public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "tickets delete upload editors"
ON public.tickets FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'));

DROP POLICY IF EXISTS "open_jobs read auth" ON public.open_jobs;
DROP POLICY IF EXISTS "open_jobs insert auth" ON public.open_jobs;
DROP POLICY IF EXISTS "open_jobs delete admin" ON public.open_jobs;

CREATE POLICY "open_jobs read staff"
ON public.open_jobs FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "open_jobs insert upload editors"
ON public.open_jobs FOR INSERT TO authenticated
WITH CHECK (public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "open_jobs delete upload editors"
ON public.open_jobs FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'));

DROP POLICY IF EXISTS "kpi_targets read auth" ON public.kpi_targets;
DROP POLICY IF EXISTS "kpi_targets admin write" ON public.kpi_targets;
DROP POLICY IF EXISTS "kpi_targets admin update" ON public.kpi_targets;
DROP POLICY IF EXISTS "kpi_targets admin delete" ON public.kpi_targets;

CREATE POLICY "kpi_targets read staff"
ON public.kpi_targets FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "kpi_targets write super admin"
ON public.kpi_targets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "kpi_targets update super admin"
ON public.kpi_targets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "kpi_targets delete super admin"
ON public.kpi_targets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "kpi_values read auth" ON public.kpi_values;
DROP POLICY IF EXISTS "kpi_values insert auth" ON public.kpi_values;
DROP POLICY IF EXISTS "kpi_values update auth" ON public.kpi_values;
DROP POLICY IF EXISTS "kpi_values delete admin" ON public.kpi_values;

CREATE POLICY "kpi_values read staff"
ON public.kpi_values FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "kpi_values insert dashboard editors"
ON public.kpi_values FOR INSERT TO authenticated
WITH CHECK (public.can_edit_page(auth.uid(), 'dashboard') OR public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "kpi_values update dashboard editors"
ON public.kpi_values FOR UPDATE TO authenticated
USING (public.can_edit_page(auth.uid(), 'dashboard') OR public.can_edit_page(auth.uid(), 'uploads'))
WITH CHECK (public.can_edit_page(auth.uid(), 'dashboard') OR public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "kpi_values delete dashboard editors"
ON public.kpi_values FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'dashboard'));

DROP POLICY IF EXISTS "notes read auth" ON public.kpi_notes;
DROP POLICY IF EXISTS "notes insert auth" ON public.kpi_notes;
DROP POLICY IF EXISTS "notes delete own or admin" ON public.kpi_notes;

CREATE POLICY "notes read staff"
ON public.kpi_notes FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "notes insert dashboard editors"
ON public.kpi_notes FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND public.can_edit_page(auth.uid(), 'dashboard'));

CREATE POLICY "notes delete dashboard editors"
ON public.kpi_notes FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'dashboard'));

DROP POLICY IF EXISTS "email_jobs read auth" ON public.email_jobs;
DROP POLICY IF EXISTS "email_jobs insert auth" ON public.email_jobs;
DROP POLICY IF EXISTS "email_jobs update admin" ON public.email_jobs;
DROP POLICY IF EXISTS "email_jobs delete admin" ON public.email_jobs;

CREATE POLICY "email_jobs read staff"
ON public.email_jobs FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "email_jobs insert email editors"
ON public.email_jobs FOR INSERT TO authenticated
WITH CHECK (public.can_edit_page(auth.uid(), 'emails'));

CREATE POLICY "email_jobs update email editors"
ON public.email_jobs FOR UPDATE TO authenticated
USING (public.can_edit_page(auth.uid(), 'emails'))
WITH CHECK (public.can_edit_page(auth.uid(), 'emails'));

CREATE POLICY "email_jobs delete email editors"
ON public.email_jobs FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'emails'));

DROP POLICY IF EXISTS "delete_req read auth" ON public.upload_delete_requests;
DROP POLICY IF EXISTS "delete_req insert own" ON public.upload_delete_requests;
DROP POLICY IF EXISTS "delete_req update admin" ON public.upload_delete_requests;
DROP POLICY IF EXISTS "delete_req delete admin" ON public.upload_delete_requests;

CREATE POLICY "delete_req read upload editors"
ON public.upload_delete_requests FOR SELECT TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "delete_req insert upload editors"
ON public.upload_delete_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid() AND public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "delete_req update upload editors"
ON public.upload_delete_requests FOR UPDATE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'))
WITH CHECK (public.can_edit_page(auth.uid(), 'uploads'));

CREATE POLICY "delete_req delete upload editors"
ON public.upload_delete_requests FOR DELETE TO authenticated
USING (public.can_edit_page(auth.uid(), 'uploads'));

DROP POLICY IF EXISTS "report-files delete" ON storage.objects;
CREATE POLICY "report-files delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-files' AND public.can_edit_page(auth.uid(), 'uploads'));

INSERT INTO public.page_permissions (user_id, page, can_view, can_edit, updated_at)
SELECT ur.user_id, page_name, true, true, now()
FROM public.user_roles ur
CROSS JOIN unnest(ARRAY['dashboard','analytics','uploads','open-jobs','customers','emails','history','support','settings']) AS page_name
WHERE ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
ON CONFLICT (user_id, page) DO UPDATE
SET can_view = true,
    can_edit = true,
    updated_at = now();
