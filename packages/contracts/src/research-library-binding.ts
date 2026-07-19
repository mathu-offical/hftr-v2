import { z } from 'zod';

/**
 * D-184 §1: how a research ENGINE binds its emit path to libraries / exec hubs.
 * Pack-internal `library` member stays for the curator spine; `targetLibraryIds` on
 * research/librarian (+ analyzer when `to_library`) carry external hydration targets.
 *
 * Child packs auto-seeded from `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES` attach to the
 * parent execution hub (`ensureEngineDataHub`). Inline specialty research inside
 * execution templates stays desk-local (no hub default).
 */
export const ResearchLibraryBinding = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create_internal') }),
  z.object({
    mode: z.literal('connect_library'),
    libraryId: z.string().uuid(),
  }),
  z.object({
    mode: z.literal('attach_execution'),
    engineInstanceId: z.string().uuid().optional(),
  }),
]);
export type ResearchLibraryBinding = z.infer<typeof ResearchLibraryBinding>;

export const ResearchLibraryBindingMode = z.enum([
  'create_internal',
  'connect_library',
  'attach_execution',
]);
export type ResearchLibraryBindingMode = z.infer<typeof ResearchLibraryBindingMode>;
