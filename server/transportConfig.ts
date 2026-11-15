/**
 * Shared Socket.IO transport limits for server configuration and integration tests.
 * Keeping this in a standalone module prevents tests from triggering server.ts startup.
 */
export const MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES = 512 * 1024; // 524,288 bytes (512 KiB)
