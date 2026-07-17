import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  COMPANY_TEMPLATES,
  CompanyTemplateId,
  CreateCompanyInput,
  DEFAULT_PHILOSOPHY_PROFILE,
  MODULE_CONFIG_SCHEMAS,
} from '@hftr/contracts';
import { companies, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { recordModuleSetup } from '@/lib/module-setup';

export const dynamic = 'force-dynamic';

const MAX_COMPANIES_PER_USER = 20;

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await scoping.listCompanies(db, clerkUserId);
    return { companies: rows };
  });
}

export async function POST(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(
      req,
      CreateCompanyInput.and(z.object({ template: CompanyTemplateId.default('blank') })),
    );

    const existing = await scoping.listCompanies(db, clerkUserId);
    if (existing.length >= MAX_COMPANIES_PER_USER) {
      throw new ApiError(422, 'company_limit_reached');
    }

    const inserted = await db
      .insert(companies)
      .values({
        clerkUserId,
        name: input.name,
        philosophyPrompt: input.philosophyPrompt,
        philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
        mode: input.mode,
        seedCreditsCents: BigInt(input.seedCreditsCents),
      })
      .returning();
    const company = inserted[0]!;
    const template = COMPANY_TEMPLATES[input.template];

    // Every company gets its non-deletable Math module (D-008).
    const [mathModule] = await db
      .insert(modules)
      .values({
        companyId: company.id,
        type: 'math',
        name: 'Deterministic Math Calculator',
        config: {},
        status: 'active',
        canvasPosition: template.mathPosition ?? { x: 320, y: 40 },
      })
      .returning({ id: modules.id });
    if (!mathModule) {
      throw new ApiError(500, 'math_module_create_failed');
    }

    // Template modules + links (D-016).
    if (template.modules.length > 0) {
      const parsedConfigs = template.modules.map((module) =>
        MODULE_CONFIG_SCHEMAS[module.type].parse(module.config),
      );
      const created = await db
        .insert(modules)
        .values(
          template.modules.map((m, index) => ({
            companyId: company.id,
            type: m.type,
            name: m.name,
            config: parsedConfigs[index],
            status: 'draft' as const,
            canvasPosition: m.position,
          })),
        )
        .returning({ id: modules.id });
      const clock = createSystemClock();
      for (let index = 0; index < created.length; index += 1) {
        const createdModule = created[index];
        const templateModule = template.modules[index];
        const config = parsedConfigs[index];
        if (!createdModule || !templateModule || !config) {
          throw new ApiError(500, 'template_module_unresolved');
        }
        const setupPatch = await recordModuleSetup(
          db,
          clock,
          company.id,
          createdModule.id,
          templateModule.type,
          config as Record<string, unknown>,
          input.templateSetup,
        );
        if (Object.keys(setupPatch).length > 0) {
          await db.update(modules).set(setupPatch).where(eq(modules.id, createdModule.id));
        }
      }
      if (template.links.length > 0) {
        await db.insert(moduleLinks).values(
          template.links.map((l) => {
            const fromModuleId = l.fromIndex === 'math' ? mathModule.id : created[l.fromIndex]?.id;
            const toModuleId = l.toIndex === 'math' ? mathModule.id : created[l.toIndex]?.id;
            if (!fromModuleId || !toModuleId) {
              throw new ApiError(500, 'template_link_unresolved');
            }
            return {
              companyId: company.id,
              fromModuleId,
              toModuleId,
              linkKind: l.linkKind,
            };
          }),
        );
      }
    }

    return { company };
  });
}
