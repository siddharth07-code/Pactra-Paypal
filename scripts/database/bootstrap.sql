-- Apply transactionally through provision-roles.mjs as the existing Auth-capable administrator.
-- Passwords are provisioned separately. No Supabase-owned object is changed.
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['pactum_runtime','pactum_worker','pactum_policy_reader','pactum_app','pactum_jobs','pactum_migrator'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=name) THEN
   EXECUTE format('CREATE ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS %s',name,CASE WHEN name IN('pactum_app','pactum_jobs','pactum_migrator') THEN 'LOGIN' ELSE 'NOLOGIN' END);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=name AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR NOT rolinherit OR rolcanlogin<>(name IN('pactum_app','pactum_jobs','pactum_migrator')))) THEN
   RAISE EXCEPTION 'Unexpected privileges for managed role %',name;
  END IF;
 END LOOP;
 EXECUTE format('GRANT pactum_migrator TO %I',current_user);
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO pactum_app,pactum_jobs,pactum_migrator',current_database());
END $$;
GRANT pactum_runtime TO pactum_app WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
GRANT pactum_worker TO pactum_jobs WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
GRANT pactum_policy_reader TO pactum_migrator WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
  WHERE member.rolname IN('pactum_runtime','pactum_worker','pactum_policy_reader','pactum_app','pactum_jobs','pactum_migrator')
  AND (m.admin_option OR NOT m.inherit_option OR NOT m.set_option OR NOT ((member.rolname='pactum_app' AND parent.rolname='pactum_runtime') OR (member.rolname='pactum_jobs' AND parent.rolname='pactum_worker') OR (member.rolname='pactum_migrator' AND parent.rolname='pactum_policy_reader')))) THEN
  RAISE EXCEPTION 'Unexpected PACTRA role membership; review existing grants before provisioning';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS pactum AUTHORIZATION pactum_migrator;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='pactum' AND pg_get_userbyid(nspowner)='pactum_migrator') THEN
  RAISE EXCEPTION 'Existing pactum schema ownership requires a reviewed forward upgrade';
 END IF;
END $$;
GRANT USAGE ON SCHEMA pactum TO pactum_runtime,pactum_worker,pactum_policy_reader;
REVOKE ALL ON SCHEMA pactum FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pactum' AND p.proname IN('verified_auth_session','verified_auth_email','install_auth_identity_fk')
  AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
  RAISE EXCEPTION 'Existing Auth adapter ownership differs from the bootstrap administrator';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION pactum.verified_auth_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=NULLIF(current_setting('app.auth_session_id',true),'')::uuid
 AND s.user_id=NULLIF(current_setting('app.auth_user_id',true),'')::uuid
 AND (s.not_after IS NULL OR s.not_after>now()) AND u.deleted_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION pactum.verified_auth_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT lower(email) FROM auth.users
 WHERE id=NULLIF(current_setting('app.auth_user_id',true),'')::uuid AND pactum.verified_auth_session();
$$;
-- The administrator already has REFERENCES on auth.users; it cannot delegate that grant.
CREATE OR REPLACE FUNCTION pactum.install_auth_identity_fk() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='pactum."User"'::regclass AND conname='auth_identity_fk') THEN
  ALTER TABLE pactum."User" ADD CONSTRAINT auth_identity_fk FOREIGN KEY("authId") REFERENCES auth.users(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='pactum."User"'::regclass AND conname='auth_identity_fk'
  AND contype='f' AND confrelid='auth.users'::regclass AND convalidated
  AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='pactum."User"'::regclass AND attname='authId')]::smallint[]
  AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id')]::smallint[]
  AND confdeltype='r' AND confupdtype='a') THEN
  RAISE EXCEPTION 'Auth identity foreign key differs from the reviewed definition';
 END IF;
END $$;
REVOKE ALL ON FUNCTION pactum.verified_auth_session(),pactum.verified_auth_email(),pactum.install_auth_identity_fk() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pactum.verified_auth_session(),pactum.verified_auth_email() TO pactum_policy_reader,pactum_migrator;
GRANT EXECUTE ON FUNCTION pactum.install_auth_identity_fk() TO pactum_migrator;
