import { z } from 'zod';
import { COMPANY_TEMPLATES, CompanyTemplateId, CreateCompanyInput } from '@hftr/contracts';
import { companies, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';

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
        mode: input.mode,
        seedCreditsCents: BigInt(input.seedCreditsCents),
      })
      .returning();
    const company = inserted[0]!;

    // Every company gets its non-deletable Math module (D-008).
    await db.insert(modules).values({
      companyId: company.id,
      type: 'math',
      name: 'Math',
      config: {},
      status: 'active',
      canvasPosition: { x: 320, y: 40 },
    });

    // Template modules + links (D-016).
    const template = COMPANY_TEMPLATES[input.template];
    if (template.modules.length > 0) {
      const created = await db
        .insert(modules)
        .values(
          template.modules.map((m) => ({
            companyId: company.id,
            type: m.type,
            name: m.name,
            config: m.config,
            status: 'draft' as const,
            canvasPosition: m.position,
          })),
        )
        .returning({ id: modules.id });
      if (template.links.length > 0) {
        await db.insert(moduleLinks).values(
          template.links.map((l) => ({
            companyId: company.id,
            fromModuleId: created[l.fromIndex]!.id,
            toModuleId: created[l.toIndex]!.id,
            linkKind: l.linkKind,
          })),
        );
      }
    }

    return { company };
  });
}
