-- D-042: expand modules.type allowed values with `librarian` (after `research`).
-- Column is plain text with no CHECK constraint on type; app-level enum in
-- Drizzle schema + @hftr/contracts. No DDL required — journals deploy ordering.
DO $$ BEGIN
  NULL;
END $$;
