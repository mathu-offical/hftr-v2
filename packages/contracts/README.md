# @hftr/contracts

Zod schemas + TypeScript types for **every artifact that crosses a boundary**: API payloads,
LLM inputs/outputs, queue job payloads, jsonb DB columns, broker adapter shapes.

Rules:

- Nothing crosses a tier, a queue, or the network without a schema defined here.
- Value-bearing fields in model-facing schemas are typed as `ValueRefHandle`, never `number`
  (see `numeric.ts` and `agent-docs/architecture/number-handling.md`).
- Enums use exhaustive `z.enum`; consumers switch with `never` default checks.

| File            | Contents                                                                          |
| --------------- | --------------------------------------------------------------------------------- |
| `foundation.ts` | Authority/mutation/queue/priority/timeout enums, `HandoffEnvelope`, failure codes |
| `numeric.ts`    | `ValueRef`, numeric+temporal kinds, descriptors, `SanityEnvelope`, calc op shapes |
| `modules.ts`    | Company, module types/subtypes/config, link kinds + `LINK_RULES` matrix           |
| `pipeline.ts`   | Trend, lead, decision tree, executable state, instruction, task, trace shapes     |
| `broker.ts`     | Adapter capability/balance/order/fill shapes, venues, connection status           |
| `llm.ts`        | Tiers, providers, call request/response wrappers, budget shapes                   |
| `env.ts`        | `ENVIRONMENT_REQUIREMENTS` manifest (kept in sync with `.env.example` by test)    |
