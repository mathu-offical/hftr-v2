import type { DeterministicActionTask } from '@hftr/contracts';
import type { KalshiCreateOrderBody } from './client';
import { centsToDollarString, formatContractCountFp } from './client';

function mapTimeInForce(
  tif: DeterministicActionTask['timeInForce'],
): KalshiCreateOrderBody['time_in_force'] {
  switch (tif) {
    case 'ioc':
      return 'immediate_or_cancel';
    case 'fok':
      return 'fill_or_kill';
    case 'gtc':
      return 'good_till_canceled';
    case 'day':
      return 'good_till_canceled';
    default: {
      const _exhaustive: never = tif;
      return _exhaustive;
    }
  }
}

export function mapTaskToKalshiOrder(
  task: DeterministicActionTask,
  clientOrderId?: string,
): KalshiCreateOrderBody | null {
  if (task.orderType !== 'limit' || task.limitPriceCents === null) {
    return null;
  }

  let side: KalshiCreateOrderBody['side'];
  switch (task.actionVerb) {
    case 'buy':
      side = 'bid';
      break;
    case 'sell':
      side = 'ask';
      break;
    default:
      return null;
  }

  return {
    ticker: task.symbol,
    ...(clientOrderId ? { client_order_id: clientOrderId } : {}),
    side,
    count: formatContractCountFp(task.quantityInt, task.quantityScale),
    price: centsToDollarString(task.limitPriceCents),
    time_in_force: mapTimeInForce(task.timeInForce),
    self_trade_prevention_type: 'taker_at_cross',
    post_only: false,
    cancel_order_on_pause: true,
    reduce_only: task.actionVerb === 'sell',
  };
}
