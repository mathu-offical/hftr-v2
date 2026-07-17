import { z } from 'zod';
import { CanvasPosition, CreateModuleInput, LinkKind, ModuleType } from './modules';

/** Bounded write tools — no envelope/catalog mutation. */
export const AssistantWriteTool = z.enum([
  'create_module',
  'update_module_config',
  'patch_module_config',
  'link_modules',
  'set_policy',
  'allocate_funds',
  'create_watchlist',
  'trigger_tier',
  'rename_module',
  'add_watchlist_item',
]);
export type AssistantWriteTool = z.infer<typeof AssistantWriteTool>;

export const AssistantEditStatus = z.enum(['pending', 'confirmed', 'rejected']);
export type AssistantEditStatus = z.infer<typeof AssistantEditStatus>;

/** Model-safe amount reference — digits parsed from user text at confirm time (D-008). */
export const AmountFromSpan = z
  .object({
    messageId: z.string().uuid(),
    spanStart: z.number().int().nonnegative(),
    spanEnd: z.number().int().positive(),
  })
  .strict()
  .refine((v) => v.spanEnd > v.spanStart, { message: 'invalid_amount_span' });

export const CreateModuleProposal = z
  .object({
    tool: z.literal('create_module'),
    type: ModuleType,
    name: z.string().min(1).max(80),
    config: z.record(z.string(), z.unknown()).optional(),
    canvasPosition: CanvasPosition.optional(),
  })
  .strict();

export const UpdateModuleConfigProposal = z
  .object({
    tool: z.literal('update_module_config'),
    moduleId: z.string().uuid(),
    configPatch: z.record(z.string(), z.unknown()),
  })
  .strict();

/** @deprecated Use update_module_config — kept for backward compatibility. */
export const PatchModuleConfigProposal = z
  .object({
    tool: z.literal('patch_module_config'),
    moduleId: z.string().uuid(),
    configPatch: z.record(z.string(), z.unknown()),
  })
  .strict();

export const LinkModulesProposal = z
  .object({
    tool: z.literal('link_modules'),
    fromModuleId: z.string().uuid(),
    toModuleId: z.string().uuid(),
    linkKind: LinkKind,
  })
  .strict();

export const SetPolicyProposal = z
  .object({
    tool: z.literal('set_policy'),
    moduleId: z.string().uuid(),
    policyEnvelopeRef: z.string().min(1).max(120).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const AllocateFundsProposal = z
  .object({
    tool: z.literal('allocate_funds'),
    fromKind: z.enum(['module', 'company_pool', 'reserve']),
    fromModuleId: z.string().uuid().nullable().optional(),
    toKind: z.enum(['module', 'company_pool', 'reserve']),
    toModuleId: z.string().uuid().nullable().optional(),
    /** API-only explicit cents — never from model text output. */
    amountCents: z.string().regex(/^\d+$/).optional(),
    /** Model path: reference user message span; resolved at confirm. */
    amountFrom: AmountFromSpan.optional(),
  })
  .strict();

export function validateAllocateFundsAmount(
  proposal: z.infer<typeof AllocateFundsProposal>,
): boolean {
  return Boolean(proposal.amountCents) !== Boolean(proposal.amountFrom);
}

const SymbolToken = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z.]+$/);

export const CreateWatchlistProposal = z
  .object({
    tool: z.literal('create_watchlist'),
    moduleId: z.string().uuid(),
    /** Optional; apply layer uppercases. Avoid Zod defaults inside discriminatedUnion. */
    symbols: z.array(SymbolToken).max(24).optional(),
  })
  .strict();

export const TriggerTierProposal = z
  .object({
    tool: z.literal('trigger_tier'),
    moduleId: z.string().uuid(),
    symbols: z.array(SymbolToken).max(24).optional(),
  })
  .strict();

export const RenameModuleProposal = z
  .object({
    tool: z.literal('rename_module'),
    moduleId: z.string().uuid(),
    name: z.string().min(1).max(120),
  })
  .strict();

export const AddWatchlistItemProposal = z
  .object({
    tool: z.literal('add_watchlist_item'),
    moduleId: z.string().uuid(),
    symbol: SymbolToken,
    bias: z.enum(['long', 'short', 'neutral']).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const AssistantEditProposal = z.discriminatedUnion('tool', [
  CreateModuleProposal,
  UpdateModuleConfigProposal,
  PatchModuleConfigProposal,
  LinkModulesProposal,
  SetPolicyProposal,
  AllocateFundsProposal,
  CreateWatchlistProposal,
  TriggerTierProposal,
  RenameModuleProposal,
  AddWatchlistItemProposal,
]);
export type AssistantEditProposal = z.infer<typeof AssistantEditProposal>;

export const CreateAssistantProposalInput = AssistantEditProposal;
export type CreateAssistantProposalInput = z.infer<typeof CreateAssistantProposalInput>;

/** Model output envelope for Mistral assistant proposal path (llm-pipeline §7). */
export const AssistantModelProposalOutput = z
  .object({
    proposal: AssistantEditProposal.nullable(),
    rationale: z.string().max(500).default(''),
    noProposalReason: z.string().max(200).optional(),
  })
  .strict();
export type AssistantModelProposalOutput = z.infer<typeof AssistantModelProposalOutput>;

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

/** Validate create_module proposal against the same rules as CreateModuleInput. */
export function validateCreateModuleProposal(
  proposal: z.infer<typeof CreateModuleProposal>,
): z.SafeParseReturnType<unknown, CreateModuleInput> {
  return CreateModuleInput.safeParse({
    type: proposal.type,
    name: proposal.name,
    config: proposal.config ?? {},
    ...(proposal.canvasPosition !== undefined ? { canvasPosition: proposal.canvasPosition } : {}),
  });
}
