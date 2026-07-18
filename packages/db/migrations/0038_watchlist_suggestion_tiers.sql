/**
 * Watchlist suggestion tiers (D-089).
 * status/source_class are plain text — new values are app-enforced.
 * Index supports Market posture / bottom-panel tier filters.
 */
CREATE INDEX IF NOT EXISTS "watchlist_items_company_status_idx"
  ON "watchlist_items" USING btree ("company_id", "status");
