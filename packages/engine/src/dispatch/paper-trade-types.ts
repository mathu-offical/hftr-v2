export interface PaperTradeRequest {
  companyId: string;
  moduleId: string;
  symbol: string;
  actionVerb: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  quantity: number;
  limitPriceCents?: number | null;
  jobId?: string | null;
  compiled?: unknown;
}

export interface PaperTradeResult {
  outcome: 'filled' | 'rejected' | 'blocked';
  failureCode: string | null;
  detail: string;
  traceId: string | null;
  fillPriceCents: number | null;
  notionalCents: number | null;
  balanceAfterCents: string | null;
}
