// F11 second instance (SPEC-app-shell.md F11): a requested path waits until the renderer can take
// it. Before I7 has answered it becomes I7's `open`; between I7 and the first N1 the latest waits
// and is delivered at that N1; afterwards it is delivered at once. Latest wins.
import { describe, expect, it } from 'vitest';
import { createOpenRequests } from './open-requests';

function setup(initial: string | null = null) {
  const delivered: string[] = [];
  const requests = createOpenRequests(initial, (path) => delivered.push(path));
  return { requests, delivered };
}

describe('createOpenRequests', () => {
  it('the first launch path is handed to I7 once', () => {
    const { requests, delivered } = setup('/a.chalk');
    expect(requests.takeStartup()).toBe('/a.chalk');
    expect(requests.takeStartup()).toBeNull();
    requests.listening();
    expect(delivered).toEqual([]);
  });

  it('a request before I7 replaces the startup path (latest wins) and is not delivered', () => {
    const { requests, delivered } = setup('/a.chalk');
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    expect(delivered).toEqual([]);
    expect(requests.takeStartup()).toBe('/c.chalk');
    requests.listening();
    expect(delivered).toEqual([]);
  });

  it('between I7 and the first N1 the latest waits, then is delivered once', () => {
    const { requests, delivered } = setup();
    expect(requests.takeStartup()).toBeNull();
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    expect(delivered).toEqual([]);
    requests.listening();
    requests.listening();
    expect(delivered).toEqual(['/c.chalk']);
  });

  it('once listening, every request is delivered at once', () => {
    const { requests, delivered } = setup();
    requests.takeStartup();
    requests.listening();
    requests.request('/b.chalk');
    requests.request('/c.chalk');
    expect(delivered).toEqual(['/b.chalk', '/c.chalk']);
  });

  it('a first N1 before I7 (never expected) still keeps the path for I7', () => {
    const { requests, delivered } = setup();
    requests.listening();
    requests.request('/b.chalk');
    expect(delivered).toEqual([]);
    expect(requests.takeStartup()).toBe('/b.chalk');
  });
});
