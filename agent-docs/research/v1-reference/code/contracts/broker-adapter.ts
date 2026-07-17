// Broker Adapter Interface — HFTR deterministic dispatch boundary
// This interface is model-free. Every broker (paper or live) implements it identically.
// The trading engine calls these methods; adapters handle broker-specific behavior.

import type { BrokerMode } from "./foundation.js";
export type { BrokerMode };

export interface OrderRequest {
  /** Internal instruction ID from the decision tree */
  instruction_id: string;
  /** Symbol e.g. "AAPL", "BTC-USD" */
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop_limit";
  quantity: number;
  /** Required for limit / stop_limit */
  limit_price?: number;
  stop_price?: number;
  /** Time-in-force */
  tif: "day" | "gtc" | "ioc" | "fok";
  /** Deterministic seed for paper replay */
  deterministic_seed: string;
  /** Client-side idempotency key */
  client_order_id: string;
  /** Epoch ms — if dispatch time exceeds this, reject */
  deadline_at: number;
}

export interface OrderAck {
  broker_order_id: string;
  client_order_id: string;
  status: "accepted" | "rejected" | "partially_filled" | "filled";
  filled_qty: number;
  avg_fill_price: number | null;
  /** Slippage in basis points relative to mid/arrival price */
  slippage_bps: number | null;
  /** ISO timestamp */
  ack_at: string;
  /** Broker-specific rejection reason if rejected */
  reject_reason?: string;
}

export interface OrderStatus {
  broker_order_id: string;
  client_order_id: string;
  status: "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected" | "expired";
  filled_qty: number;
  remaining_qty: number;
  avg_fill_price: number | null;
  last_updated: string;
}

export interface CancelResult {
  broker_order_id: string;
  success: boolean;
  message?: string;
}

export interface IBrokerAdapter {
  readonly mode: BrokerMode;
  readonly adapterId: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  submitOrder(order: OrderRequest): Promise<OrderAck>;
  cancelOrder(brokerId: string, clientOrderId: string): Promise<CancelResult>;
  getOrderStatus(brokerId: string): Promise<OrderStatus>;
}
