import { eq } from 'drizzle-orm';
import { AssistantEditProposal, MODULE_CONFIG_SCHEMAS, type ModuleType } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { modules, watchlistItems } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError } from '@/lib/api';

export async function applyAssistantEdit(
  db: Db,
  clerkUserId: string,
  companyId: string,
  proposal: AssistantEditProposal,
): Promise<void> {
  switch (proposal.tool) {
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
    case 'patch_module_config': {
      const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, proposal.moduleId);
      const schema = MODULE_CONFIG_SCHEMAS[existing.type as ModuleType];
      const merged = { ...(existing.config as Record<string, unknown>), ...proposal.configPatch };
      const nextConfig = schema.parse(merged);
      await db
        .update(modules)
        .set({ config: nextConfig, updatedAt: new Date() })
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
          symbol: proposal.symbol,
          bias: proposal.bias,
          note: proposal.note,
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
