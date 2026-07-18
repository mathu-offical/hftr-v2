import { z } from 'zod';
import {
  CreateEngineUtilityLinkInput,
  EngineUtilityBus,
} from '@hftr/contracts';
import {
  createEngineUtilityLink,
  listEngineUtilityLinks,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId: _clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const url = new URL(_req.url);
    const engineId = url.searchParams.get('engineId') ?? undefined;
    if (engineId) {
      z.string().uuid().parse(engineId);
    }
    const rows = await listEngineUtilityLinks(db, companyId, engineId);
    return {
      utilityLinks: rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        toEngineId: row.toEngineId,
        bus: EngineUtilityBus.parse(row.bus),
        fromEngineId: row.fromEngineId,
        fromModuleId: row.fromModuleId,
        streamId: row.streamId,
        streamDescriptor: row.streamDescriptor,
      })),
    };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId: _clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const body = await parseBody(req, CreateEngineUtilityLinkInput);
    if (body.toEngineId && body.fromEngineId && body.toEngineId === body.fromEngineId) {
      throw new ApiError(422, 'engine_utility_self_link');
    }
    const row = await createEngineUtilityLink(db, {
      companyId,
      toEngineId: body.toEngineId,
      bus: body.bus,
      ...(body.fromEngineId ? { fromEngineId: body.fromEngineId } : {}),
      ...(body.fromModuleId ? { fromModuleId: body.fromModuleId } : {}),
      ...(body.streamId ? { streamId: body.streamId } : {}),
      ...(body.streamDescriptor ? { streamDescriptor: body.streamDescriptor } : {}),
    });
    if (!row) throw new ApiError(500, 'engine_utility_link_create_failed');
    return {
      utilityLink: {
        id: row.id,
        companyId: row.companyId,
        toEngineId: row.toEngineId,
        bus: EngineUtilityBus.parse(row.bus),
        fromEngineId: row.fromEngineId,
        fromModuleId: row.fromModuleId,
        streamId: row.streamId,
        streamDescriptor: row.streamDescriptor,
      },
    };
  });
}
