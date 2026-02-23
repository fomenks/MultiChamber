# MultiChamber Debug Logging Summary

## Overview

This document summarizes the comprehensive debug logging added to the MultiChamber proxy subsystem to help diagnose WebSocket upgrade and HTTP proxying issues.

## Debug Tags

### [DEBUG SERVER]
- Server startup and shutdown events
- WebSocket upgrade events (request headers, cookies, token extraction)
- Upgrade handling status

### [DEBUG VALIDATE]
- User authentication and token validation
- Token extraction from cookies (with full cookie header logging)
- User lookup and instance assignment
- OpenChamber instance creation

### [DEBUG OC]
- OpenChamber instance management
- Port availability checks
- Health checks
- Script execution output (for debugging runOC.sh failures)

### [DEBUG PROXY]
- HTTP request proxying (full headers, path transformation)
- Request body logging
- Response handling (HTML rewriting, path prefix updates)
- Error details with full context

### [DEBUG API PROXY]
- API terminal proxying (same detail level as DEBUG PROXY)
- Token authentication for terminal API

### [DEBUG WS]
- WebSocket upgrade handling
- Cookie parsing and token extraction
- Path transformation (removing /chamber and /api/terminal prefixes)
- Socket connection and data streaming
- Byte counts for data flow

### [DEBUG DIAGNOSTIC]
- Diagnostic endpoint testing
- Direct connection to OpenChamber

## Key Issues Fixed

### Issue 1: WebSocket Upgrade Cookie Parsing

**Problem**: WebSocket upgrade handler was not logging cookie extraction details, making it hard to debug authentication failures.

**Solution**: Added detailed cookie logging:
```typescript
console.log(`[DEBUG WS] Request headers.cookie: ${request.headers.cookie}`);
const cookieMatch = request.headers.cookie.match(/token=([^;]+)/);
if (cookieMatch) {
  token = cookieMatch[1];
  console.log(`[DEBUG WS] Token extracted from cookie: ${token.substring(0, 20)}...`);
}
```

### Issue 2: X-Forwarded-Prefix Header Incorrect

**Problem**: WebSocket proxy was always setting `X-Forwarded-Prefix: /chamber` even for API terminal requests.

**Solution**: Added conditional logic based on path:
```typescript
const isChamberWs = targetPath.startsWith('/chamber') || originalPath.startsWith('/chamber');
headerStr += `X-Forwarded-Prefix: ${isChamberWs ? '/chamber' : '/api/terminal'}\r\n`;
```

### Issue 3: Diagnostic Endpoint Missing Authentication

**Problem**: `/chamber/__diagnostic` endpoint was not running the `validateUserProxy` middleware, returning "No OpenChamber instance available" even with valid cookies.

**Solution**: Added middleware to diagnostic route:
```typescript
router.get('/__diagnostic', validateUserProxy, async (req: ExpressRequest, res: Response) => {
```

## Debug Logging Examples

### WebSocket Upgrade (Success)
```
========== [DEBUG WS] WebSocket Upgrade Started ==========
[DEBUG WS] Timestamp: 2026-02-22T22:04:37.868Z
[DEBUG WS] Upgrade request received for: /chamber/api/terminal/
[DEBUG WS] Request headers.cookie: token=eyJhbG...
[DEBUG WS] Token extracted from cookie: eyJhbG...
[DEBUG WS] Proxying WebSocket to port 11001
[DEBUG WS] Connected to OpenChamber on port 11001
[DEBUG WS] Sockets piped successfully
```

### HTTP Proxy (Success)
```
========== [DEBUG PROXY] Request Started ==========
[DEBUG PROXY] Request: POST /chamber/
[DEBUG PROXY] Original URL: /chamber/api/terminal/
[DEBUG PROXY] Path transformation:
  - Original URL: /chamber/api/terminal/
  - Target path: /api/terminal/
[DEBUG PROXY] HTML body length: 17068 bytes
[DEBUG PROXY] Rewritten body length: 17172 bytes
```

### Authentication (Success)
```
========== [DEBUG VALIDATE] Started ==========
[DEBUG VALIDATE] Token found in cookies
[DEBUG VALIDATE] Token payload: {"username":"admin","isAdmin":true}
[DEBUG VALIDATE] User found: admin, isAdmin: true
[DEBUG VALIDATE] Instance ready - port: 11001, status: running
```

## Testing Commands

### 1. Test HTTP Proxy
```bash
curl -s http://localhost:8123/chamber/ -H "Cookie: token=YOUR_TOKEN"
```

### 2. Test WebSocket Upgrade
```bash
curl -i -N -X GET \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Cookie: token=YOUR_TOKEN" \
  http://localhost:8123/chamber/api/terminal/
```

### 3. Test Diagnostic Endpoint
```bash
curl -s http://localhost:8123/chamber/__diagnostic -H "Cookie: token=YOUR_TOKEN"
```

### 4. View Debug Logs
```bash
docker logs multichamber 2>&1 | grep "DEBUG\|WS"
```

## Implementation Files

- `/home/opencode/workspace/OC/MultiChamber/server/src/routes/proxy.ts` - Main proxy routes
- `/home/opencode/workspace/OC/MultiChamber/server/src/services/openChamberService.ts` - Instance management
- `/home/opencode/workspace/OC/MultiChamber/server/src/index.ts` - Server entry point

## Next Steps for Production

1. Reduce log verbosity by changing `NODE_ENV=production` (removes debug logging)
2. Implement structured logging (JSON format) for easier parsing
3. Add log rotation to prevent disk space issues
4. Consider adding trace IDs for request tracking