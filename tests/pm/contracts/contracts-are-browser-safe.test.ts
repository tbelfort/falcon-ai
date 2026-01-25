import { describe, expect, it } from 'vitest';
import * as http from '../../../src/pm/contracts/http.js';
import * as ws from '../../../src/pm/contracts/ws.js';

describe('pm contracts', () => {
  it('load without node-only side effects', () => {
    expect(http).toBeDefined();
    expect(ws).toBeDefined();
  });
});
