export type OrderStatus =
  | 'pending_submit' | 'submitted' | 'accepted' | 'partially_filled' | 'filled'
  | 'pending_cancel' | 'canceled' | 'rejected' | 'expired' | 'failed';

export const TERMINAL: ReadonlySet<OrderStatus> = new Set(['filled', 'canceled', 'rejected', 'expired', 'failed']);
export const OPEN: ReadonlySet<OrderStatus> = new Set(['pending_submit', 'submitted', 'accepted', 'partially_filled', 'pending_cancel']);

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending_submit: ['submitted', 'accepted', 'partially_filled', 'filled', 'rejected', 'canceled', 'expired', 'failed', 'pending_cancel'],
  submitted: ['accepted', 'partially_filled', 'filled', 'rejected', 'canceled', 'expired', 'pending_cancel'],
  accepted: ['partially_filled', 'filled', 'canceled', 'expired', 'pending_cancel', 'rejected'],
  partially_filled: ['partially_filled', 'filled', 'canceled', 'expired', 'pending_cancel'],
  pending_cancel: ['canceled', 'filled', 'partially_filled', 'expired', 'accepted'],
  filled: [],
  canceled: [],
  rejected: [],
  expired: [],
  failed: [],
};

/** Whether moving from `from` to `to` is a legal forward transition. Same-state is a no-op (allowed). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}
