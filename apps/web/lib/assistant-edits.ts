import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  allowedLinkKinds,
  AssistantEditProposal,
  isLegalFundRoute,
  MODULE_CONFIG_SCHEMAS,
  moduleRequiresMath,
  ModuleType,
  PolicyModuleConfig,
  type ModuleType as ModuleTypeT,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { scoping } from '@hftr/db';
import { fundTransfers, libraries, moduleLinks, modules, watchlistItems } from '@hftr/db/schema';
import { createSystemClock, enqueue, estimateLlmJobCost } from '@hftr/engine';
import { ApiError } from '@/lib/api';
import { recordModuleSetup } from '@/lib/module-setup';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { provisionDedicatedMathTools } from '@/lib/math-provision';

const MAX_MODULES_PER_COMPANY = 60;

export interface ApplyAssistantEditContext {
  userMessageText?: string;
}

export function parseAmountCentsFromSpan(
  message: string,
  spanStart: number,
  spanEnd: number,
): bigint {
  const slice = message.slice(spanStart, spanEnd).trim();
  const normalized = slice.replace(/[$,\s]/g, '');
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new ApiError(422, 'amount_span_unparseable');
  const whole = BigInt(match[1]!);
  const frac = match[2] ?? '';
  const cents =
    frac.length === 0
      ? whole * 100n
      : frac.length === 1
        ? whole * 100n + BigInt(frac) * 10n
        : whole * 100n + BigInt(frac);
  if (cents <= 0n) throw new ApiError(422, 'amount_must_be_positive');
  return cents;
}

export async function applyAssistantEdit(
  db: Db,
  clerkUserId: string,
  companyId: string,
  proposal: AssistantEditProposal,
  ctx: ApplyAssistantEditContext = {},
): Promise<void> {
  switch (proposal.tool) {
    case 'create_module': {
      const existing = await scoping.listModules(db, clerkUserId, companyId);
      const requiredSlots = moduleRequiresMath(proposal.type) ? 2 : 1;
      if (existing.length + requiredSlots > MAX_MODULES_PER_COMPANY) {
        throw new ApiError(422, 'module_limit_reached');
      }
      const config = MODULE_CONFIG_SCHEMAS[proposal.type as ModuleTypeT].parse(
        proposal.config ?? {},
      );
      const clock = createSystemClock();
      const inserted = await db
        .insert(modules)
        .values({
          companyId,
          type: proposal.type,
          name: proposal.name,
          generatedNameBase: proposal.name,
          nameCustomized: false,
          config,
          canvasPosition: proposal.canvasPosition ?? { x: 0, y: 0 },
          status: proposal.type === 'math' ? 'active' : 'draft',
          engineInstanceId: null,
          topicSectorsOverridden: false,
        })
        .returning();
      const module = inserted[0];
      if (!module) throw new ApiError(500, 'module_insert_failed');
      await recordModuleSetup(
        db,
        clock,
        companyId,
        module.id,
        proposal.type,
        config as Record<string, unknown>,
        undefined,
      );
      if (proposal.type === 'library') {
        const topicScope =
          typeof (config as { topicScope?: string }).topicScope === 'string'
            ? (config as { topicScope: string }).topicScope
            : '';
        await db
          .insert(libraries)
          .values({
            companyId,
            moduleId: module.id,
            name: module.name,
            topicScope,
            masterLibrary: false,
          })
          .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });
      }
      await provisionDedicatedMathTools(db, companyId, [
        {
          id: module.id,
          type: module.type,
          name: module.name,
          position: module.canvasPosition as { x: number; y: number },
        },
      ]);
      return;
    }
    case 'update_module_config':
    case 'patch_module_config': {
      const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      const schema = MODULE_CONFIG_SCHEMAS[existing.type as ModuleTypeT];
      const merged = { ...(existing.config as Record<string, unknown>), ...proposal.configPatch };
      const nextConfig = schema.parse(merged);
      await db
        .update(modules)
        .set({ config: nextConfig, updatedAt: new Date() })
        .where(eq(modules.id, proposal.moduleId));
      return;
    }
    case 'link_modules': {
      if (proposal.fromModuleId === proposal.toModuleId) {
        throw new ApiError(422, 'self_link_not_allowed');
      }
      const from = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.fromModuleId);
      const to = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.toModuleId);
      const fromType = ModuleType.parse(from.type);
      const toType = ModuleType.parse(to.type);
      const allowed = allowedLinkKinds(fromType, toType);
      if (!allowed.includes(proposal.linkKind)) {
        throw new ApiError(422, 'link_kind_not_allowed');
      }
      if (proposal.linkKind === 'fund_route' && !isLegalFundRoute(fromType, toType)) {
        throw new ApiError(422, 'fund_route_must_traverse_math');
      }
      const inserted = await db
        .insert(moduleLinks)
        .values({
          companyId,
          fromModuleId: proposal.fromModuleId,
          toModuleId: proposal.toModuleId,
          linkKind: proposal.linkKind,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) throw new ApiError(409, 'link_already_exists');
      await refreshGeneratedModuleNames(db, companyId, [
        proposal.fromModuleId,
        proposal.toModuleId,
      ]);
      return;
    }
    case 'set_policy': {
      const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      if (existing.type !== 'policy') throw new ApiError(422, 'not_a_policy_module');
      const patch: Record<string, unknown> = {};
      if (proposal.policyEnvelopeRef !== undefined) {
        patch.policyEnvelopeRef = proposal.policyEnvelopeRef;
      }
      if (proposal.notes !== undefined) patch.notes = proposal.notes;
      if (Object.keys(patch).length === 0) throw new ApiError(422, 'policy_patch_empty');
      const merged = { ...(existing.config as Record<string, unknown>), ...patch };
      const nextConfig = PolicyModuleConfig.parse(merged);
      await db
        .update(modules)
        .set({ config: nextConfig, updatedAt: new Date() })
        .where(eq(modules.id, proposal.moduleId));
      return;
    }
    case 'allocate_funds': {
      let amountCents: bigint;
      if (proposal.amountCents !== undefined) {
        amountCents = BigInt(proposal.amountCents);
      } else if (proposal.amountFrom) {
        if (!ctx.userMessageText) throw new ApiError(422, 'amount_from_requires_message');
        amountCents = parseAmountCentsFromSpan(
          ctx.userMessageText,
          proposal.amountFrom.spanStart,
          proposal.amountFrom.spanEnd,
        );
      } else {
        throw new ApiError(422, 'allocate_funds_amount_missing');
      }
      if (proposal.fromKind === 'module' && !proposal.fromModuleId) {
        throw new ApiError(422, 'from_module_required');
      }
      if (proposal.toKind === 'module' && !proposal.toModuleId) {
        throw new ApiError(422, 'to_module_required');
      }
      if (proposal.fromModuleId) {
        await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.fromModuleId);
      }
      if (proposal.toModuleId) {
        await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.toModuleId);
      }
      await db.insert(fundTransfers).values({
        companyId,
        fromKind: proposal.fromKind,
        fromModuleId: proposal.fromModuleId ?? null,
        toKind: proposal.toKind,
        toModuleId: proposal.toModuleId ?? null,
        amountCents,
        status: 'requested',
        requestedBy: 'user',
      });
      return;
    }
    case 'create_watchlist': {
      const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      if (module_.type !== 'trading' && module_.type !== 'trend') {
        throw new ApiError(422, 'module_type_not_watchable');
      }
      for (const symbol of proposal.symbols ?? []) {
        const normalized = symbol.toUpperCase();
        await db
          .insert(watchlistItems)
          .values({
            companyId,
            moduleId: proposal.moduleId,
            symbol: normalized,
            bias: 'neutral',
            note: '',
          })
          .onConflictDoUpdate({
            target: [watchlistItems.moduleId, watchlistItems.symbol],
            set: { status: 'watching', updatedAt: new Date() },
          });
      }
      return;
    }
    case 'trigger_tier': {
      const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');
      const clock = createSystemClock();
      if (module_.type === 'trend') {
        const symbols =
          proposal.symbols && proposal.symbols.length > 0 ? proposal.symbols : ['SPY', 'QQQ'];
        await enqueue(db, clock, {
          queueClass: 'RESEARCH',
          kind: 'trend.scan',
          payload: { companyId, moduleId: proposal.moduleId, symbols, lookbackMinutes: 60 },
          idempotencyKey: `assist-tier-${randomUUID()}`,
          priority: 'NORMAL',
          companyId,
          moduleId: proposal.moduleId,
        });
        return;
      }
      if (module_.type === 'research') {
        const config = (module_.config ?? {}) as { topicScope?: string; focus?: string };
        const topicScope = config.topicScope ?? config.focus ?? '';
        await enqueue(db, clock, {
          queueClass: 'RESEARCH',
          kind: 'research.curate',
          costEstimate: estimateLlmJobCost('research.curate'),
          payload: { companyId, moduleId: proposal.moduleId, topicScope },
          idempotencyKey: `assist-tier-${randomUUID()}`,
          priority: 'NORMAL',
          companyId,
          moduleId: proposal.moduleId,
        });
        return;
      }
      throw new ApiError(422, 'module_type_not_triggerable');
    }
    case 'rename_module': {
      const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      if (existing.type === 'math') {
        throw new ApiError(422, 'math_module_name_not_customizable');
      }
      await db
        .update(modules)
        .set({ name: proposal.name, nameCustomized: true, updatedAt: new Date() })
        .where(eq(modules.id, proposal.moduleId));
      return;
    }
    case 'add_watchlist_item': {
      const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      if (module_.type !== 'trading' && module_.type !== 'trend') {
        throw new ApiError(422, 'module_type_not_watchable');
      }
      await db
        .insert(watchlistItems)
        .values({
          companyId,
          moduleId: proposal.moduleId,
          symbol: proposal.symbol.toUpperCase(),
          bias: proposal.bias ?? 'neutral',
          note: proposal.note ?? '',
        })
        .onConflictDoUpdate({
          target: [watchlistItems.moduleId, watchlistItems.symbol],
          set: {
            bias: proposal.bias,
            note: proposal.note,
            status: 'watching',
            updatedAt: new Date(),
          },
        });
      return;
    }
    default: {
      const _exhaustive: never = proposal;
      throw new ApiError(422, 'unsupported_assistant_tool');
    }
  }
}
