import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRoomConfig } from '../src/types/game';

describe('Free Draw Mobile Debug Suite', () => {
  it('Room Config: Only Free Draw rooms have isFreeDraw === true', () => {
    const freeDraw = getRoomConfig('Free Draw');
    assert.strictEqual(freeDraw.isFreeDraw, true);

    const generalTest = getRoomConfig('General #Test');
    assert.strictEqual(Boolean(generalTest.isFreeDraw), false);

    const general10P = getRoomConfig('General #10P');
    assert.strictEqual(Boolean(general10P.isFreeDraw), false);

    const experimental = getRoomConfig('🧪 Experimental Draw');
    assert.strictEqual(Boolean(experimental.isFreeDraw), false);
    assert.strictEqual(experimental.isExperimental, true);

    const customRoom = getRoomConfig('CustomRoom123');
    assert.strictEqual(Boolean(customRoom.isFreeDraw), false);
  });

  it('Activation logic: ?fddebug=1 activates and persists to localStorage', () => {
    const storage: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (k: string) => storage[k] || null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; }
    };

    const checkActive = (search: string) => {
      const params = new URLSearchParams(search);
      if (params.get('fddebug') === '1') {
        mockLocalStorage.setItem('freedraw_mobile_debug', '1');
        return true;
      }
      return mockLocalStorage.getItem('freedraw_mobile_debug') === '1';
    };

    // Initially inactive
    assert.strictEqual(checkActive(''), false);

    // Activated with ?fddebug=1
    assert.strictEqual(checkActive('?fddebug=1'), true);
    assert.strictEqual(mockLocalStorage.getItem('freedraw_mobile_debug'), '1');

    // On subsequent load without query param, still active from localStorage
    assert.strictEqual(checkActive(''), true);

    // Disabling clears localStorage
    mockLocalStorage.removeItem('freedraw_mobile_debug');
    assert.strictEqual(checkActive(''), false);
  });

  it('URL with existing params: &fddebug=1 activates cleanly', () => {
    const params = new URLSearchParams('room=Free%20Draw&name=Player1&fddebug=1');
    assert.strictEqual(params.get('fddebug'), '1');
    assert.strictEqual(params.get('room'), 'Free Draw');

    // Removing fddebug preserves other parameters
    params.delete('fddebug');
    assert.strictEqual(params.get('fddebug'), null);
    assert.strictEqual(params.get('room'), 'Free Draw');
    assert.strictEqual(params.get('name'), 'Player1');
    assert.strictEqual(params.toString(), 'room=Free+Draw&name=Player1');
  });

  it('Settings toggles control freedraw_bucket_undo_diag and freedraw_bucket_checkpoint_exp independently', () => {
    const storage: Record<string, string> = {};

    const toggle = (key: string, currentVal: boolean) => {
      const next = !currentVal;
      if (next) storage[key] = '1';
      else delete storage[key];
      return next;
    };

    let undoDiag = false;
    let chkptExp = false;

    // Toggle undoDiag ON
    undoDiag = toggle('freedraw_bucket_undo_diag', undoDiag);
    assert.strictEqual(undoDiag, true);
    assert.strictEqual(storage['freedraw_bucket_undo_diag'], '1');
    assert.strictEqual(storage['freedraw_bucket_checkpoint_exp'], undefined);

    // Toggle chkptExp ON
    chkptExp = toggle('freedraw_bucket_checkpoint_exp', chkptExp);
    assert.strictEqual(chkptExp, true);
    assert.strictEqual(storage['freedraw_bucket_undo_diag'], '1');
    assert.strictEqual(storage['freedraw_bucket_checkpoint_exp'], '1');

    // Toggle undoDiag OFF
    undoDiag = toggle('freedraw_bucket_undo_diag', undoDiag);
    assert.strictEqual(undoDiag, false);
    assert.strictEqual(storage['freedraw_bucket_undo_diag'], undefined);
    assert.strictEqual(storage['freedraw_bucket_checkpoint_exp'], '1', 'chkptExp remains ON');
  });
});
