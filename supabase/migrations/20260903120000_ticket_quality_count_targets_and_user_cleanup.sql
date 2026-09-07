-- Ticket Quality now tracks the number of error rows, not a percentage
-- calculated from a TCR Total file.
UPDATE public.kpi_targets
SET
  label = 'Ticket Quality',
  cadence = 'Monthly',
  unit = 'count',
  direction = 'lower_is_better',
  green_min = 10,
  yellow_min = 10,
  target_display = '<= 10',
  auto = true
WHERE kpi_key = 'ticket_quality';

-- Remove old/unwanted user accounts and access rows. If these email addresses
-- sign up again later, the normal signup trigger will recreate a fresh profile.
DO $$
DECLARE
  removed_emails text[] := ARRAY[
    'iyannibuildsweb@gmail.com',
    'alphadaniela320@gmail.com',
    'wickendtrader@gmail.com',
    'karlatoursandtravel@gmail.com'
  ];
BEGIN
  DELETE FROM public.page_permissions pp
  USING public.profiles p
  WHERE pp.user_id = p.id
    AND lower(p.email) = ANY (removed_emails);

  DELETE FROM public.user_roles ur
  USING public.profiles p
  WHERE ur.user_id = p.id
    AND lower(p.email) = ANY (removed_emails);

  DELETE FROM public.profiles p
  WHERE lower(p.email) = ANY (removed_emails);

  DELETE FROM auth.users u
  WHERE lower(u.email) = ANY (removed_emails);
END $$;
