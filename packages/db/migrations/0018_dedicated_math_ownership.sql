-- D-033: explicit dedicated Math ownership. Existing Math modules remain
-- unowned; migration intentionally does not infer ownership from graph links.
ALTER TABLE "modules" ADD COLUMN "tool_owner_module_id" uuid;

ALTER TABLE "modules"
  ADD CONSTRAINT "modules_tool_owner_module_id_modules_id_fk"
  FOREIGN KEY ("tool_owner_module_id")
  REFERENCES "public"."modules"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "modules_tool_owner_unique"
  ON "modules" USING btree ("tool_owner_module_id");

ALTER TABLE "modules"
  ADD CONSTRAINT "modules_tool_owner_not_self"
  CHECK ("tool_owner_module_id" IS NULL OR "tool_owner_module_id" <> "id");

ALTER TABLE "modules"
  ADD CONSTRAINT "modules_tool_owner_math_only"
  CHECK ("tool_owner_module_id" IS NULL OR "type" = 'math');
