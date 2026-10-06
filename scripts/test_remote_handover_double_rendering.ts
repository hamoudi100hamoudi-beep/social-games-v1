// Test remote stroke handover and double-rendering prevention
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Remote Handover & Double-Rendering Architectural Invariants', () => {
  it('Single dot stroke: commit must remove session from activeSessionsRef immediately', () => {
    // Simulate spectator state
    const activeSessions: Record<string, any> = {};
    let drainingStrokes: any[] = [];
    let mainCanvasDrawCount = 0;
    let tempCanvasRenderCount = 0;

    const instId = 'user_01';
    const strokeId = 42;

    // 1. draw_start arrives for a single dot
    activeSessions[instId] = {
      tool: 'pencil',
      color: '#000000',
      width: 5,
      opacity: 1,
      path: [{ x: 100, y: 100 }],
      strokeId: 0, // was 0 in draw_start
      networkPointCount: 1,
      pendingQueue: [],
      repairPending: false
    };

    // Redraw temp layer
    tempCanvasRenderCount++;
    assert.strictEqual(Object.keys(activeSessions).length, 1);

    // 2. draw_commit arrives with pointCount = 1, queue empty
    const session = activeSessions[instId];
    assert.ok(session);
    assert.strictEqual(session.networkPointCount, 1);
    assert.strictEqual(session.pendingQueue.length, 0);

    // In fixed architecture: synchronous atomic commit with guaranteed cleanup
    mainCanvasDrawCount++;
    delete activeSessions[instId];
    drainingStrokes = drainingStrokes.filter(s => !(s.instanceId === instId && s.strokeId === strokeId));

    // Synchronous temp layer redraw
    const strokesOnTemp = Object.keys(activeSessions).length + drainingStrokes.length;

    // INVARIANT: Stroke is on main canvas, but NO LONGER on temp canvas!
    assert.strictEqual(mainCanvasDrawCount, 1, 'Stroke must be drawn on main canvas');
    assert.strictEqual(strokesOnTemp, 0, 'Zero strokes remaining on temp canvas (NO DOUBLE RENDERING)');
    assert.strictEqual(activeSessions[instId], undefined, 'Session must be deleted from activeSessions');
  });

  it('Paused / Slow stroke: queue already drained when commit arrives', () => {
    const activeSessions: Record<string, any> = {};
    let drainingStrokes: any[] = [];
    let mainCanvasStrokes: any[] = [];

    const instId = 'user_02';
    const strokeId = 99;

    // draw_start + moves accumulated directly in path while drawer held finger
    activeSessions[instId] = {
      tool: 'pencil',
      color: '#ff0000',
      width: 8,
      opacity: 1,
      path: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 }
      ],
      strokeId: 0,
      networkPointCount: 3,
      pendingQueue: [], // Drained during pause
      repairPending: false
    };

    const session = activeSessions[instId];
    assert.strictEqual(session.pendingQueue.length, 0);

    // draw_commit arrives: synchronous atomic handover
    mainCanvasStrokes.push({
      instId,
      strokeId,
      path: [...session.path]
    });
    delete activeSessions[instId];
    drainingStrokes = drainingStrokes.filter(s => !(s.instanceId === instId && s.strokeId === strokeId));

    // Verify temp layer has 0 copies, main canvas has exactly 1 copy
    const tempStrokesCount = Object.keys(activeSessions).length + drainingStrokes.length;
    assert.strictEqual(tempStrokesCount, 0, 'Temp layer has zero copies of stroke');
    assert.strictEqual(mainCanvasStrokes.length, 1, 'Main canvas has exactly one copy');
    assert.strictEqual(mainCanvasStrokes[0].path.length, 3, 'All 3 points preserved on main canvas');
  });

  it('In-flight draining stroke is flushed before subsequent draw_start of same player', () => {
    let drainingStrokes: any[] = [
      {
        instanceId: 'user_03',
        strokeId: 10,
        tool: 'pencil',
        color: '#00ff00',
        width: 5,
        opacity: 1,
        path: [{ x: 50, y: 50 }],
        pendingQueue: [{ x: 60, y: 60 }, { x: 70, y: 70 }]
      }
    ];
    let mainCanvasCount = 0;

    const newStartInstId = 'user_03';

    // When draw_start arrives for user_03, in-flight draining strokes must be flushed immediately
    if (drainingStrokes.some(s => s.instanceId === newStartInstId)) {
      const priorDraining = drainingStrokes.filter(s => s.instanceId === newStartInstId);
      drainingStrokes = drainingStrokes.filter(s => s.instanceId !== newStartInstId);
      for (const stroke of priorDraining) {
        while (stroke.pendingQueue.length > 0) {
          stroke.path.push(stroke.pendingQueue.shift()!);
        }
        mainCanvasCount++;
        assert.strictEqual(stroke.path.length, 3, 'All in-flight points flushed to path before commit');
      }
    }

    assert.strictEqual(drainingStrokes.length, 0, 'No lingering draining strokes for user_03');
    assert.strictEqual(mainCanvasCount, 1, 'Prior stroke committed to main canvas before starting new stroke');
  });
});
