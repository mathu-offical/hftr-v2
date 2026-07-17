'use client';

import {
  LlmConnectionStatusProvider,
  LlmRibbonStatusChip,
} from '@/components/shell/LlmConnectionStatus';
import { UserSettingsLauncher } from '@/components/shell/UserSettingsModal';

/**
 * Directory header status + settings (client). UserMenu stays on the server
 * page so it can resolve Clerk/dev auth without crossing the client boundary.
 */
export function CompaniesDirectoryStatus() {
  return (
    <LlmConnectionStatusProvider>
      <LlmRibbonStatusChip />
      <UserSettingsLauncher />
    </LlmConnectionStatusProvider>
  );
}
