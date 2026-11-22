import type { RiderLocationInput, SocketAck } from '@delyva/contracts';
import { LocationReporter, type LocationTransport } from './location-reporter';

const fix = (ts: number): RiderLocationInput => ({ lat: 6.43, lng: 3.42, heading: null, ts });

function transport(
  over: Partial<LocationTransport> = {},
): LocationTransport & { batches: RiderLocationInput[][] } {
  const batches: RiderLocationInput[][] = [];
  return {
    batches,
    socketConnected: () => true,
    sendSocket: () => Promise.resolve<SocketAck>({ ok: true }),
    sendBatch: (points) => {
      batches.push(points);
      return Promise.resolve({ accepted: points.length, rejected: 0 });
    },
    now: () => 10_000,
    ...over,
  };
}

describe('LocationReporter', () => {
  it('sends over the socket when connected', async () => {
    const t = transport();
    expect(await new LocationReporter(t).report(fix(9_000))).toBe('socket');
    expect(t.batches).toEqual([]);
  });

  it('falls back to the HTTP batch when the socket is down', async () => {
    const t = transport({ socketConnected: () => false });
    expect(await new LocationReporter(t).report(fix(9_000))).toBe('http');
    expect(t.batches).toEqual([[fix(9_000)]]);
  });

  it('falls back to HTTP when the socket ack times out', async () => {
    const t = transport({
      sendSocket: () => Promise.resolve<SocketAck>({ ok: false, code: 'internal_error' }),
    });
    expect(await new LocationReporter(t).report(fix(9_000))).toBe('http');
  });

  it('buffers while both channels fail and flushes everything in order later', async () => {
    // Arrange
    let httpUp = false;
    const t = transport({
      socketConnected: () => false,
      sendBatch: (points) => {
        if (!httpUp) return Promise.reject(new TypeError('offline'));
        t.batches.push(points);
        return Promise.resolve({ accepted: points.length, rejected: 0 });
      },
    });
    const r = new LocationReporter(t);

    // Act
    await r.report(fix(8_000));
    await r.report(fix(9_000));
    const bufferedWhileDown = r.buffered;
    httpUp = true;
    await r.report(fix(9_500));

    // Assert
    expect(bufferedWhileDown).toBe(2);
    expect(t.batches).toEqual([[fix(8_000), fix(9_000), fix(9_500)]]);
    expect(r.buffered).toBe(0);
  });

  it('drops buffered fixes older than the server accepts', async () => {
    const t = transport({ socketConnected: () => false, now: () => 10 * 60_000 });
    await new LocationReporter(t).report(fix(1_000));
    expect(t.batches).toEqual([]);
  });

  it('does not resend a fix the server rejected as invalid', async () => {
    const t = transport({
      sendSocket: () => Promise.resolve<SocketAck>({ ok: false, code: 'validation_failed' }),
    });
    expect(await new LocationReporter(t).report(fix(9_000))).toBe('buffered');
    expect(t.batches).toEqual([]);
  });
});
