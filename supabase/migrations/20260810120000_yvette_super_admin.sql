DO $$
DECLARE target_user uuid;
BEGIN
  SELECT id INTO target_user
  FROM auth.users
  WHERE lower(email) = 'yvette@triaconsultingus.com'
  LIMIT 1;

  IF target_user IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (target_user, 'Yvette@triaconsultingus.com', 'Yvette')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user, 'super_admin'), (target_user, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

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
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO has_super;
  IF NOT has_super THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
