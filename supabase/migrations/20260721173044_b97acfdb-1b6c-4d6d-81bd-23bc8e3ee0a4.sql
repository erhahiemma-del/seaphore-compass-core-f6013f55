
-- Seed development users. Idempotent: skips if the email already exists.
-- Password: SeaphoreDev!2026 (bcrypt-hashed). Rotate before production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  dev_password TEXT := 'SeaphoreDev!2026';
  seed RECORD;
  new_user_id UUID;
BEGIN
  FOR seed IN
    SELECT * FROM (VALUES
      ('admin@seaphore.local',     'Dev Administrator', 'admin'::public.app_role),
      ('director@seaphore.local',  'Dev Director',      'director'::public.app_role),
      ('officer@seaphore.local',   'Dev Officer',       'officer'::public.app_role),
      ('analyst@seaphore.local',   'Dev Analyst',       'analyst'::public.app_role)
    ) AS t(email, full_name, role)
  LOOP
    SELECT id INTO new_user_id FROM auth.users WHERE email = seed.email;

    IF new_user_id IS NULL THEN
      new_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        seed.email,
        crypt(dev_password, gen_salt('bf')),
        now(), now(), now(),
        jsonb_build_object('provider','email','providers',ARRAY['email']),
        jsonb_build_object('full_name', seed.full_name, 'seaphore_dev', true),
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        new_user_id,
        new_user_id::text,
        jsonb_build_object('sub', new_user_id::text, 'email', seed.email, 'email_verified', true),
        'email',
        now(), now(), now()
      );
    END IF;

    -- Profile row (best-effort; skip if profiles schema differs)
    BEGIN
      INSERT INTO public.profiles (id, email, full_name)
      VALUES (new_user_id, seed.email, seed.full_name)
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Role assignment
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, seed.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;
