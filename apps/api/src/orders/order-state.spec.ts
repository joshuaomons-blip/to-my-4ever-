import { canTransition } from './order-state';

describe('order state machine', () => {
  it('allows forward transitions', () => {
    expect(canTransition('pending_submit', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'partially_filled')).toBe(true);
    expect(canTransition('partially_filled', 'filled')).toBe(true);
    expect(canTransition('pending_cancel', 'filled')).toBe(true); // cancel lost the race
  });
  it('never leaves a terminal state or regresses', () => {
    for (const t of ['filled', 'canceled', 'rejected', 'expired', 'failed'] as const) {
      expect(canTransition(t, 'accepted')).toBe(false);
    }
    expect(canTransition('partially_filled', 'accepted')).toBe(false);
  });
});
