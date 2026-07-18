UPDATE "companies"
SET
  "equity_cents" = "seed_credits_cents",
  "equity_status" = 'fresh',
  "equity_as_of" = COALESCE("equity_as_of", now())
WHERE "equity_cents" IS NULL;
