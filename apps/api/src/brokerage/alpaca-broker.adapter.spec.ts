import { AlpacaBrokerAdapter } from './alpaca-broker.adapter';
import { BrokerError } from './broker-adapter';

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('unexpected call');
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const opts = { baseUrl: 'https://broker-api.sandbox.alpaca.markets', apiKey: 'key', apiSecret: 'secret' };

describe('AlpacaBrokerAdapter (contract, mocked HTTP)', () => {
  it('uses HTTP Basic auth and the documented order endpoint with client_order_id', async () => {
    const m = mockFetch([{ status: 200, body: { id: 'o1', client_order_id: 'aur-1', status: 'accepted', filled_qty: '0', created_at: 't', updated_at: 't' } }]);
    const a = new AlpacaBrokerAdapter(opts, m.fn);
    const o = await a.submitOrder('acct-1', { clientOrderId: 'aur-1', symbol: 'AAPL', side: 'buy', type: 'market', timeInForce: 'day', quantity: '1' });
    expect(a.isSandbox).toBe(true);
    expect(m.calls[0]!.url).toBe('https://broker-api.sandbox.alpaca.markets/v1/trading/accounts/acct-1/orders');
    expect((m.calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`);
    expect(JSON.parse(String(m.calls[0]!.init.body)).client_order_id).toBe('aur-1');
    expect(o.status).toBe('accepted');
  });

  it('never retries an order submission on network failure (outcome unknown)', async () => {
    const m = mockFetch([new Error('socket hang up')]);
    const a = new AlpacaBrokerAdapter(opts, m.fn);
    await expect(a.submitOrder('a', { clientOrderId: 'c', symbol: 'X', side: 'buy', type: 'market', timeInForce: 'day', quantity: '1' })).rejects.toMatchObject({ kind: 'transient' });
    expect(m.calls).toHaveLength(1);
  });

  it('retries idempotent reads on 5xx and maps errors', async () => {
    const m = mockFetch([{ status: 503 }, { status: 200, body: { cash: '10', buying_power: '10', equity: '10' } }]);
    const a = new AlpacaBrokerAdapter(opts, m.fn);
    expect((await a.getBalances('a')).buyingPower).toBe('10');
    expect(m.calls).toHaveLength(2);
    const r = mockFetch([{ status: 422, body: { message: 'insufficient buying power' } }]);
    const e = await new AlpacaBrokerAdapter(opts, r.fn).cancelOrder('a', 'o').catch((x) => x);
    expect(e).toBeInstanceOf(BrokerError);
    expect((e as BrokerError).kind).toBe('rejected');
    expect((e as BrokerError).retryable).toBe(false);
  });

  it('normalises partner statuses', async () => {
    const m = mockFetch([{ status: 200, body: { id: 'x', account_number: 'N', status: 'APPROVAL_PENDING', currency: 'USD' } }]);
    expect((await new AlpacaBrokerAdapter(opts, m.fn).getAccount('x')).status).toBe('action_required');
  });
});
