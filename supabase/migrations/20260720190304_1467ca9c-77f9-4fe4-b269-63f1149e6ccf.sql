
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

DO $$
DECLARE first_admin uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    SELECT ur.user_id INTO first_admin
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'
    ORDER BY p.created_at NULLS LAST, ur.created_at
    LIMIT 1;
    IF first_admin IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (first_admin, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_super boolean;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO has_super;
  IF NOT has_super THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.report_uploads
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

UPDATE public.report_uploads
SET effective_from = COALESCE(effective_from, week_start),
    effective_to   = COALESCE(effective_to, week_start + INTERVAL '6 days')
WHERE effective_from IS NULL OR effective_to IS NULL;

CREATE TABLE IF NOT EXISTS public.page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_permissions TO authenticated;
GRANT ALL ON public.page_permissions TO service_role;
ALTER TABLE public.page_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own page permissions"
  ON public.page_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages page permissions"
  ON public.page_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_name text,
  target_table text NOT NULL,
  target_id text,
  summary text,
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edit_requests TO authenticated;
GRANT ALL ON public.edit_requests TO service_role;
ALTER TABLE public.edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own edit requests or super admin sees all"
  ON public.edit_requests FOR SELECT TO authenticated
  USING (auth.uid() = requested_by OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users create own edit requests"
  ON public.edit_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Super admin updates edit requests"
  ON public.edit_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owner or super admin deletes edit requests"
  ON public.edit_requests FOR DELETE TO authenticated
  USING (auth.uid() = requested_by OR public.is_super_admin(auth.uid()));
