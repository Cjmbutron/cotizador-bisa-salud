-- Endurecimiento para Supabase (también es inofensivo en un PostgreSQL común).
-- Supabase publica las tablas del esquema "public" por su API REST y la llave "anon" es pública (va en la web).
-- Sin esto, cualquiera con esa llave podría leer o escribir tarifas y cotizaciones sin pasar por nuestra API.
-- 1) se quita todo permiso a anon/authenticated/service_role sobre nuestras tablas, secuencias y funciones,
-- 2) se activa RLS (sin políticas para ellos = acceso denegado aunque algún permiso reaparezca),
-- 3) el único rol de aplicación (cotizador_app) tiene una política explícita; las reglas de integridad siguen en triggers/CHECK.
-- Ejecutar DESPUÉS de crear el rol cotizador_app (lo hace apps/api/scripts/desplegar-db.cjs).
DO $$
DECLARE t record; r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['anon','authenticated','service_role']) LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', r);
      -- Lo que se cree en el futuro tampoco debe quedar abierto
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;

  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotizador_app') THEN
      EXECUTE format('DROP POLICY IF EXISTS app_total ON public.%I', t.tablename);
      EXECUTE format('CREATE POLICY app_total ON public.%I FOR ALL TO cotizador_app USING (true) WITH CHECK (true)', t.tablename);
    END IF;
  END LOOP;
END $$;
