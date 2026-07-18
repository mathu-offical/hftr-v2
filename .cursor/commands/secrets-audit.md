# Secrets hygiene audit

Audit that API keys and broker secrets are never exposed in job payloads, LLM
prompts, logs, or public APIs.

**Sources:** `.cursor/skills/secrets-hygiene/SKILL.md`,
`.cursor/workflows/secrets-hygiene-audit.md`, `.cursor/rules/secrets-hygiene.mdc`

1. Follow the skill audit checklist (grep enqueue payloads, settings GETs, LLM invoke).
2. Run payload-secrets vitest + typecheck for touched packages.
3. Fix any findings; re-audit until clean.
4. Update `agent-docs/ops/security-audit.md` if protocol changed.
5. Close via `/end-run` if code changed.
