import { z } from 'zod';

/** Bounded write tools — no envelope/catalog mutation. */
export const AssistantWriteTool = z.enum([
  'rename_module',
  'patch_module_config',
  'add_watchlist_item',
]);
export type AssistantWriteTool = z.infer<typeof AssistantWriteTool>;

export const AssistantEditStatus = z.enum(['pending', 'confirmed', 'rejected']);
export type AssistantEditStatus = z.infer<typeof AssistantEditStatus>;

export const RenameModuleProposal = z
  .object({
    tool: z.literal('rename_module'),
    moduleId: z.string().uuid(),
    name: z.string().min(1).max(120),
  })
  .strict();

export const PatchModuleConfigProposal = z
  .object({
    tool: z.literal('patch_module_config'),
    moduleId: z.string().uuid(),
    configPatch: z.record(z.string(), z.unknown()),
  })
  .strict();

export const AddWatchlistItemProposal = z
  .object({
    tool: z.literal('add_watchlist_item'),
    moduleId: z.string().uuid(),
    symbol: z
      .string()
      .min(1)
      .max(12)
      .regex(/^[A-Za-z.]+$/)
      .transform((s) => s.toUpperCase()),
    bias: z.enum(['long', 'short', 'neutral']).default('neutral'),
    note: z.string().max(500).default(''),
  })
  .strict();

export const AssistantEditProposal = z.discriminatedUnion('tool', [
  RenameModuleProposal,
  PatchModuleConfigProposal,
  AddWatchlistItemProposal,
]);
export type AssistantEditProposal = z.infer<typeof AssistantEditProposal>;

export const CreateAssistantProposalInput = AssistantEditProposal;
export type CreateAssistantProposalInput = z.infer<typeof CreateAssistantProposalInput>;

export const AssistantEdit = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  clerkUserId: z.string(),
  tool: AssistantWriteTool,
  proposal: AssistantEditProposal,
  status: AssistantEditStatus,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type AssistantEdit = z.infer<typeof AssistantEdit>;

export const AssistantProposalsResponse = z.object({
  proposals: z.array(AssistantEdit),
});
export type AssistantProposalsResponse = z.infer<typeof AssistantProposalsResponse>;
