-- Supabase exposes the public schema through its Data API, using a key that ships in the browser.
-- With row level security on and no policies, that API can read nothing from these tables.
-- The app is unaffected: it connects as the table owner, and owners bypass row level security.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
