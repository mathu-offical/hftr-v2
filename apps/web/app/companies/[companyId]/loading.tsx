import { CompanyShellLoadingFrame } from '@/components/shell/CompanyShellLoading';

/**
 * Instant shell chrome while the company workspace server tree resolves (D-196).
 */
export default function CompanyLoading() {
  return <CompanyShellLoadingFrame />;
}
