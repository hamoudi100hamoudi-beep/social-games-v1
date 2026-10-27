export interface DrawingIdentityDependencies {
  roomManager: any;
}

/**
 * Production handler for register_drawing_identity enforcing safe payload validation.
 */
export function handleRegisterDrawingIdentity(
  socket: any,
  data: any,
  deps: DrawingIdentityDependencies
): void {
  try {
    const { roomManager } = deps;
    if (!socket || !roomManager) return;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const instanceId = typeof data.instanceId === 'string' ? data.instanceId.trim() : '';
      if (instanceId.length > 0) {
        roomManager.registerDrawingIdentity(socket.id, instanceId);
      }
    }
  } catch (err) {
    console.error("Error registering drawing identity:", err);
  }
}

/**
 * Production handler for unregister_drawing_identity enforcing safe payload validation.
 */
export function handleUnregisterDrawingIdentity(
  socket: any,
  data: any,
  deps: DrawingIdentityDependencies
): void {
  try {
    const { roomManager } = deps;
    if (!socket || !roomManager) return;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const instanceId = typeof data.instanceId === 'string' ? data.instanceId.trim() : '';
      if (instanceId.length > 0) {
        roomManager.unregisterDrawingIdentity(socket.id, instanceId);
      }
    }
  } catch (err) {
    console.error("Error unregistering drawing identity:", err);
  }
}

/**
 * Registers both register_drawing_identity and unregister_drawing_identity event listeners on a socket.
 */
export function registerDrawingIdentityHandlers(
  socket: any,
  deps: DrawingIdentityDependencies
): void {
  socket.on('register_drawing_identity', (data: any) => {
    handleRegisterDrawingIdentity(socket, data, deps);
  });

  socket.on('unregister_drawing_identity', (data: any) => {
    handleUnregisterDrawingIdentity(socket, data, deps);
  });
}
