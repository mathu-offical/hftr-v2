const MAX_FILL_DEVIATION_BPS = 50;

export function buildFillVerificationFields(args: {
  quantity: number;
  quantityInt: string;
  fillPriceCents: number;
  quoteLastCents: number | null;
  actionVerb: 'buy' | 'sell';
  limitPriceCents: number | null;
}): Array<{ field: string; pass: boolean; detail: string }> {
  const deviationBps = Math.abs(
    Math.round(
      ((args.fillPriceCents - (args.quoteLastCents ?? args.fillPriceCents)) / args.fillPriceCents) *
        10_000,
    ),
  );
  return [
    {
      field: 'quantity',
      pass: args.quantityInt === String(args.quantity),
      detail: 'fill quantity matches instruction',
    },
    {
      field: 'fill_price_deviation',
      pass: deviationBps <= MAX_FILL_DEVIATION_BPS,
      detail: `deviation ${deviationBps} bps vs bound ${MAX_FILL_DEVIATION_BPS}`,
    },
    {
      field: 'limit_respected',
      pass:
        args.limitPriceCents === null ||
        (args.actionVerb === 'buy'
          ? args.fillPriceCents <= args.limitPriceCents
          : args.fillPriceCents >= args.limitPriceCents),
      detail: 'fill respects limit price',
    },
  ];
}
