// F11, F12, F13, T17 (SPEC-app-shell.md R37): waiting open requests form a first-in-first-out queue
// of at most 20 (the 21st is dropped and logged); before I7 the first is I7's `open`; between I7
// and the first N1 they wait; afterwards each is delivered in arrival order, one at a time. A close
// waits in the same queue, behind the opens that came before it. `openTarget` answers the tab a
// path is bound to (nothing read) or opens it.
import { describe, expect, it } from 'vitest';
import {
  MAX_WAITING_OPENS,
  createOpenRequests,
  openTarget,
  type OpenRequest,
} from './open-requests';

const label = (request: OpenRequest): string => (request.kind === 'open' ? request.path : 'close');

function setup(initial: string | null = null) {
  const delivered: string[] = [];
  const logged: string[] = [];
  const requests = createOpenRequests(initial, {
    deliver: (request) => {
      delivered.push(label(request));
    },
    log: (message) => logged.push(message),
  });
  return { requests, delivered, logged };
}

/** A queue whose deliveries finish only when the test releases them, one by one. */
function gated() {
  const delivered: string[] = [];
  const finished: string[] = [];
  const gates: (() => void)[] = [];
  const logged: string[] = [];
  const requests = createOpenRequests(null, {
    deliver: (request) =>
      new Promise<void>((resolve) => {
        delivered.push(label(request));
        gates.push(() => {
          finished.push(label(request));
          resolve();
        });
      }),
    log: (message) => logged.push(message),
  });
  /** Finishes the delivery in progress and lets the queue start the next one. */
  const release = async (): Promise<void> => {
    gates.shift()?.();
    await flush();
  };
  return { requests, delivered, finished, release, logged };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('createOpenRequests', () => {
  it('the first launch path is handed to I7 once', () => {
    const { requests, delivered } = setup('/a.chalk');
    expect(requests.takeStartup()).toBe('/a.chalk');
    expect(requests.takeStartup()).toBeNull();
    requests.listening();
    expect(delivered).toEqual([]);
  });

  it('nothing asked: I7 gets null', () => {
    const { requests } = setup();
    expect(requests.takeStartup()).toBeNull();
  });

  it('requests before I7 queue behind the startup path: I7 gets the first, the rest follow at N1 in order', async () => {
    const { requests, delivered } = setup('/a.chalk');
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    expect(delivered).toEqual([]);
    expect(requests.takeStartup()).toBe('/a.chalk');
    expect(delivered).toEqual([]);
    requests.listening();
    await requests.idle();
    expect(delivered).toEqual(['/b.chalk', '/c.chalk']);
  });

  it('without a launch file the first request before I7 becomes I7’s open', async () => {
    const { requests, delivered } = setup();
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    expect(requests.takeStartup()).toBe('/b.chalk');
    requests.listening();
    await requests.idle();
    expect(delivered).toEqual(['/c.chalk']);
  });

  it('before the first N1 the queue holds every request; at N1 each is delivered once, in order', async () => {
    const { requests, delivered } = setup();
    expect(requests.takeStartup()).toBeNull();
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    requests.request('/d.chalk');
    await flush();
    expect(delivered).toEqual([]);
    requests.listening();
    requests.listening();
    await requests.idle();
    expect(delivered).toEqual(['/b.chalk', '/c.chalk', '/d.chalk']);
  });

  it('three Explorer requests (three files, Enter) arrive as three opens, first in first out', async () => {
    const { requests, delivered } = setup();
    requests.takeStartup();
    requests.listening();
    requests.request('/1.chalk');
    requests.request('/2.png');
    requests.request('/3.svg');
    await requests.idle();
    expect(delivered).toEqual(['/1.chalk', '/2.png', '/3.svg']);
  });

  it('deliveries run one at a time: the next waits until the previous one has finished', async () => {
    const { requests, delivered, finished, release } = gated();
    requests.takeStartup();
    requests.listening();
    requests.request('/1.chalk');
    requests.request('/2.chalk');
    await flush();
    expect(delivered).toEqual(['/1.chalk']);
    await release();
    await flush();
    expect(finished).toEqual(['/1.chalk']);
    expect(delivered).toEqual(['/1.chalk', '/2.chalk']);
    await release();
    expect(finished).toEqual(['/1.chalk', '/2.chalk']);
  });

  it(`at most ${MAX_WAITING_OPENS} opens wait: the 21st is dropped and logged without its path`, async () => {
    expect(MAX_WAITING_OPENS).toBe(20);
    const { requests, delivered, logged } = setup();
    requests.takeStartup();
    for (let i = 1; i <= 21; i++) requests.request(`/secret-${i}.chalk`);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/dropped/i);
    expect(logged.join('\n')).not.toMatch(/secret/);
    requests.listening();
    await requests.idle();
    expect(delivered).toEqual(Array.from({ length: 20 }, (_, i) => `/secret-${i + 1}.chalk`));
    // Once the queue has drained, a new request is taken again.
    requests.request('/later.chalk');
    await requests.idle();
    expect(delivered.at(-1)).toBe('/later.chalk');
    expect(logged).toHaveLength(1);
  });

  it('the cap counts waiting opens only: one being delivered does not hold a place', async () => {
    const { requests, delivered, logged, release } = gated();
    requests.takeStartup();
    requests.listening();
    requests.request('/0.chalk');
    await flush();
    expect(delivered).toEqual(['/0.chalk']);
    for (let i = 1; i <= 20; i++) requests.request(`/${i}.chalk`);
    expect(logged).toEqual([]);
    requests.request('/21.chalk');
    expect(logged).toHaveLength(1);
    for (let i = 0; i <= 20; i++) await release();
    expect(delivered).toHaveLength(21);
    expect(delivered).not.toContain('/21.chalk');
  });

  it('a close waits behind the opens before it and is not reordered; opens after it follow it', async () => {
    const { requests, delivered, release } = gated();
    requests.takeStartup();
    requests.listening();
    requests.request('/1.chalk');
    requests.request('/2.chalk');
    requests.close();
    requests.request('/3.chalk');
    await flush();
    expect(delivered).toEqual(['/1.chalk']);
    await release();
    await release();
    await release();
    await release();
    expect(delivered).toEqual(['/1.chalk', '/2.chalk', 'close', '/3.chalk']);
  });

  it('a close with nothing waiting is delivered at once, as before', () => {
    const { requests, delivered } = setup();
    requests.takeStartup();
    requests.listening();
    requests.close();
    expect(delivered).toEqual(['close']);
  });

  it('one close waits at most (a second one while it waits adds nothing); a close is never dropped by the cap', async () => {
    const { requests, delivered, logged, release } = gated();
    requests.takeStartup();
    requests.listening();
    requests.request('/0.chalk');
    for (let i = 1; i <= 20; i++) requests.request(`/${i}.chalk`);
    requests.close();
    requests.close();
    expect(logged).toEqual([]);
    for (let i = 0; i < 25; i++) await release();
    expect(delivered.filter((d) => d === 'close')).toHaveLength(1);
    expect(delivered.at(-1)).toBe('close');
    // After it was delivered, a new close is taken again.
    requests.close();
    await flush();
    expect(delivered.filter((d) => d === 'close')).toHaveLength(2);
  });

  it('a delivery that fails is logged and the next request still runs', async () => {
    const delivered: string[] = [];
    const logged: string[] = [];
    const requests = createOpenRequests(null, {
      deliver: (request) => {
        delivered.push(label(request));
        if (label(request) === '/bad.chalk') return Promise.reject(new Error('EACCES'));
        return undefined;
      },
      log: (message) => logged.push(message),
    });
    requests.takeStartup();
    requests.listening();
    requests.request('/bad.chalk');
    requests.request('/good.chalk');
    await requests.idle();
    expect(delivered).toEqual(['/bad.chalk', '/good.chalk']);
    expect(logged).toEqual(['Open request failed: Error: EACCES']);
  });

  it('a first N1 before I7 (never expected) still keeps the path for I7', () => {
    const { requests, delivered } = setup();
    requests.listening();
    requests.request('/b.chalk');
    expect(delivered).toEqual([]);
    expect(requests.takeStartup()).toBe('/b.chalk');
  });
});

describe('openTarget (T17)', () => {
  function ports(bound: Record<string, string>) {
    const calls: string[] = [];
    return {
      calls,
      ports: {
        realPath: (path: string) => {
          calls.push(`real ${path}`);
          return Promise.resolve(path.replace('\\link\\', '\\real\\'));
        },
        tabOf: (real: string) => {
          calls.push(`tab ${real}`);
          return Promise.resolve(bound[real.toLowerCase()] ?? null);
        },
        open: () => {
          calls.push('open');
          return Promise.resolve('ref');
        },
      },
    };
  }

  it('a path bound to a tab answers that tab and opens (reads) nothing', async () => {
    const { calls, ports: p } = ports({ 'c:\\real\\ethanol.chalk': 'tab-a' });
    expect(await openTarget('C:\\link\\Ethanol.chalk', p)).toEqual({ focus: 'tab-a' });
    expect(calls).toEqual(['real C:\\link\\Ethanol.chalk', 'tab C:\\real\\Ethanol.chalk']);
  });

  it('an unbound path is opened', async () => {
    const { calls, ports: p } = ports({});
    expect(await openTarget('C:\\docs\\ethanol.chalk', p)).toBe('ref');
    expect(calls.at(-1)).toBe('open');
  });

  it('a name without an Open extension is never looked up (no binding can hold it)', async () => {
    const { calls, ports: p } = ports({});
    expect(await openTarget('C:\\docs\\notes.docx', p)).toBe('ref');
    expect(await openTarget('', p)).toBe('ref');
    expect(calls).toEqual(['open', 'open']);
  });
});
