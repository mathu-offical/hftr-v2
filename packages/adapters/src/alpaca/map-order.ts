import type { DeterministicActionTask } from '@hftr/contracts';

/** Alpaca order submission body (Trading API v2). */
export interface AlpacaOrderBody {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
  client_order_id: string;
  limit_price?: string;
  stop_price?: string;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function quantityString(task: DeterministicActionTask): string {
  if (task.quantityScale === 0) {
    return task.quantityInt;
  }
  const scale = 10 ** task.quantityScale;
  const whole = BigInt(task.quantityInt);
  const intPart = whole / BigInt(scale);
  const fracPart = whole % BigInt(scale);
  if (fracPart === 0n) {
    return intPart.toString();
  }
  const frac = fracPart.toString().padStart(task.quantityScale, '0').replace(/0+$/, '');
  return `${intPart}.${frac}`;
}

/**
 * Map a finalized deterministic task to an Alpaca order payload.
 * client_order_id prefers an explicit value, else falls back to idempotencyKey.
 */
export function mapTaskToAlpacaOrder(
  task: DeterministicActionTask,
  clientOrderId?: string,
): AlpacaOrderBody {
  let side: AlpacaOrderBody['side'];
  switch (task.actionVerb) {
    case 'buy':
    case 'sell':
      side = task.actionVerb;
      break;
    case 'cancel':
    case 'replace':
    case 'close_position':
      throw new Error(`unsupported_action_verb:${task.actionVerb}`);
    default: {
      const _exhaustive: never = task.actionVerb;
      throw new Error(`unsupported_action_verb:${String(_exhaustive)}`);
    }
  }

  const body: AlpacaOrderBody = {
    symbol: task.symbol.toUpperCase(),
    qty: quantityString(task),
    side,
    type: task.orderType,
    time_in_force: task.timeInForce === 'day' ? 'day' : 'gtc',
    client_order_id: clientOrderId ?? task.idempotencyKey,
  };
  if (task.limitPriceCents !== null) {
    body.limit_price = centsToDollars(task.limitPriceCents);
  }
  if (task.stopPriceCents !== null) {
    body.stop_price = centsToDollars(task.stopPriceCents);
  }
  return body;
}
