import { Router } from 'express';
import * as http from 'http';
import * as net from 'net';
import { OpenChamberService } from '../services/openChamberService.js';
import { UserService } from '../services/userService.js';
import { JWTService } from '../services/jwtService.js';
import type { Request as ExpressRequest, Response, NextFunction } from 'express';

const router = Router();
const openChamberService = new OpenChamberService();
const userService = new UserService();

const validateUserProxy = async (req: ExpressRequest, res: Response, next: NextFunction): Promise<void> => {
  console.log(`\n========== [DEBUG VALIDATE] Started ==========`);  
  console.log(`[DEBUG VALIDATE] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG VALIDATE] Request: ${req.method} ${req.url}`);
  
  if (!req.user) {
    console.log(`[DEBUG VALIDATE] No user in request, checking token...`);
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.cookies?.token) {
      console.log(`[DEBUG VALIDATE] Token found in cookies`);
      token = req.cookies.token;
    } else {
      console.log(`[DEBUG VALIDATE] Token: ${token ? token.substring(0, 20) + '...' : 'none'}`);
    }

    if (!token) {
      console.log(`[DEBUG VALIDATE] No token found, rejecting with 401`);
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = JWTService.verifyToken(token);
    if (!payload) {
      console.log(`[DEBUG VALIDATE] Invalid token, rejecting with 401`);
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    console.log(`[DEBUG VALIDATE] Token payload: ${JSON.stringify(payload)}`);

    const user = userService.getUser(payload.username);
    if (!user) {
      console.log(`[DEBUG VALIDATE] User ${payload.username} not found, rejecting with 401`);
      res.status(401).json({ error: 'User not found' });
      return;
    }
    console.log(`[DEBUG VALIDATE] User found: ${user.username}, isAdmin: ${user.isAdmin}`);
    console.log(`[DEBUG VALIDATE] Setting userInfo`);

    (req as any).userInfo = {
      username: user.username,
      isAdmin: user.isAdmin,
    };
  } else {
    console.log(`[DEBUG VALIDATE] User already in request: ${req.user.username}`);
    (req as any).userInfo = {
      username: req.user.username,
      isAdmin: req.user.isAdmin,
    };
  }

  const userInfo = (req as any).userInfo as { username: string; isAdmin: boolean };
  const user: { username: string; homeDir: string } = {
    username: userInfo.username,
    homeDir: `/home/${userInfo.username}`
  };
  
  console.log(`[DEBUG VALIDATE] Getting or starting OpenChamber instance for ${user.username}`);
  const instance = await openChamberService.getOrStartInstance(user as any);
  (req as any).openChamberPort = instance.port;
  console.log(`[DEBUG VALIDATE] Instance ready - port: ${instance.port}, status: ${instance.status}`);
  console.log(`[DEBUG VALIDATE] Completed successfully`);
  console.log(`========== [DEBUG VALIDATE] Completed ==========\n`);
  
  next();
};

const dynamicProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  console.log(`\n========== [DEBUG PROXY] Request Started ==========`);  
  console.log(`[DEBUG PROXY] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG PROXY] Request: ${req.method} ${req.url}`);
  console.log(`[DEBUG PROXY] User: ${userInfo?.username || 'unknown'}, Port: ${port || 'none'}`);
  console.log(`[DEBUG PROXY] Original Headers: ${JSON.stringify(req.headers, null, 2)}`);
  
  if (!port) {
    console.log(`[DEBUG PROXY] No port assigned, showing placeholder`);
    const placeholderHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>OpenChamber - ${userInfo?.username || 'User'}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; 
      justify-content: center; 
      align-items: center; 
      min-height: 100vh; 
      margin: 0; 
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    .user { 
      background: #e0e7ff; 
      padding: 8px 16px; 
      border-radius: 6px;
      display: inline-block;
    }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🖥️ OpenChamber</h1>
    <p>Welcome to your workspace, <span class="user">${userInfo?.username || 'User'}</span></p>
    <p class="error">OpenChamber instance not available or starting.</p>
    <p><small>Port: Not assigned</small></p>
    <p><small>Timestamp: ${new Date().toISOString()}</small></p>
  </div>
</body>
</html>`;
    console.log(`[DEBUG PROXY] Sending placeholder (no port available)`);
    res.setHeader('Content-Type', 'text/html');
    res.send(placeholderHtml);
    console.log(`========== [DEBUG PROXY] Request Completed ==========\n`);
    return;
  }

  // Correctly handle path transformation
  const originalUrl = req.url || '/';
  let targetPath = originalUrl;
  
  // Remove /chamber prefix
  if (targetPath.startsWith('/chamber')) {
    targetPath = targetPath.substring('/chamber'.length) || '/';
  }
  
  const targetHost = '127.0.0.1';
  
  console.log(`[DEBUG PROXY] Original URL (from request): ${originalUrl}`);
  console.log(`[DEBUG PROXY] Path transformation:`);
  console.log(`  - Original URL: ${originalUrl}`);
  console.log(`  - Target path: ${targetPath}`);
  console.log(`  - Target: ${targetHost}:${port}`);
  
  // Prepare headers - remove Express-specific headers that might cause issues
  const headers: any = {};
  for (const [key, value] of Object.entries(req.headers)) {
    // Skip Express internal headers and host (we'll set our own)
    if (key !== 'host' && key !== 'content-length' && value !== undefined) {
      headers[key] = value;
    }
  }
  
  headers['host'] = `${targetHost}:${port}`;
  headers['X-MultiChamber-User'] = userInfo?.username || '';
  headers['X-MultiChamber-Admin'] = userInfo?.isAdmin ? 'true' : 'false';
  headers['X-Forwarded-Prefix'] = originalUrl.startsWith('/chamber') ? '/chamber' : '/api/terminal';
  headers['X-Forwarded-Uri'] = originalUrl;
  console.log(`[DEBUG PROXY] Outgoing headers:`);
  console.log(JSON.stringify(headers, null, 2));
  
  console.log(`[DEBUG API PROXY] Outgoing headers:`);
  console.log(JSON.stringify(headers, null, 2));
  
  const options: http.RequestOptions = {
    hostname: targetHost,
    port: port,
    path: targetPath,
    method: req.method,
    headers: headers,
    timeout: 60000,
    family: 4, // Force IPv4
  };
  
  console.log(`[DEBUG API PROXY] Request options:`);
  console.log(JSON.stringify(options, null, 2));

  const proxyReq = http.request(options, (proxyRes) => {
    console.log(`[DEBUG PROXY] Response received: ${proxyRes.statusCode} ${http.STATUS_CODES[proxyRes.statusCode || 0]}`);
    console.log(`[DEBUG PROXY] Response headers:`);
    console.log(JSON.stringify(proxyRes.headers, null, 2));
    
    const contentType = proxyRes.headers['content-type'] || '';
    
    if (contentType.includes('text/html')) {
      const chunks: Buffer[] = [];
      
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        console.log(`[DEBUG PROXY] HTML body length: ${body.length} bytes`);
        console.log(`[DEBUG PROXY] HTML body preview (first 2000 chars):`);
        console.log(body.substring(0, 2000));
        if (body.length > 2000) {
          console.log(`... [truncated, total: ${body.length}]`);
        }
        
        // Enhanced path rewriting
        let rewrittenBody = body
          .replace(/(href=["'])\//g, '$1/chamber/')
          .replace(/(src=["'])\//g, '$1/chamber/')
          .replace(/(action=["'])\//g, '$1/chamber/')
          .replace(/(url\()\//g, '$1/chamber/')
          .replace(/location\.origin/g, "'http://localhost:8080/chamber'")
          // Handle relative URLs in CSS
          .replace(/(url\s*\(\s*["']?)\//g, '$1/chamber/');
        
        const headers = { ...proxyRes.headers };
        delete headers['x-frame-options'];
        
        const byteLength = Buffer.byteLength(rewrittenBody);
        console.log(`[DEBUG PROXY] Rewritten body length: ${byteLength} bytes`);
        console.log(`[DEBUG PROXY] Rewritten body preview (first 1500 chars):`);
        console.log(rewrittenBody.substring(0, 1500));
        
        res.writeHead(proxyRes.statusCode || 200, {
          ...headers,
          'content-length': byteLength,
        });
        res.end(rewrittenBody);
        console.log(`[DEBUG PROXY] HTML response sent to client`);
      });
    } else {
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      res.writeHead(proxyRes.statusCode || 200, headers);
      
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
        console.log(`[DEBUG PROXY] Non-HTML data chunk received: ${chunk.length} bytes`);
      });
      
      proxyRes.on('end', () => {
        const totalSize = Buffer.concat(chunks).length;
        console.log(`[DEBUG PROXY] Non-HTML response complete: ${totalSize} bytes total`);
      });
      
      proxyRes.pipe(res);
      console.log(`[DEBUG PROXY] Non-HTML response piped`);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('\n========== [DEBUG PROXY] Error Details ==========');
    console.error('[DEBUG PROXY] Proxy request error:', err.message);
    console.error('[DEBUG PROXY] Error stack:', err.stack);
    console.error(`[DEBUG PROXY] Request info: ${req.method} ${req.url}`);
    console.error(`[DEBUG PROXY] Port: ${port}, Path: ${targetPath}`);
    console.error(`[DEBUG PROXY] Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.error('====================================================\n');
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'OpenChamber instance unavailable',
        details: err.message,
        port: port,
        path: targetPath
      });
    }
  });

  proxyReq.on('timeout', () => {
    console.error(`[DEBUG PROXY] Request timeout after 60s`);
    console.error(`[DEBUG PROXY] Request: ${req.method} ${req.url}`);
    console.error(`[DEBUG PROXY] Port: ${port}, Path: ${targetPath}`);
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout' });
    }
  });

  // Handle request body properly
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[DEBUG PROXY] Request body content:`);
    console.log(JSON.stringify(req.body, null, 2).substring(0, 1000));
    
    // Check content type to determine how to send body
    const contentType = req.headers['content-type'] || '';
    console.log(`[DEBUG PROXY] Content-Type: ${contentType}`);
    if (contentType.includes('application/json')) {
      console.log(`[DEBUG PROXY] Sending as JSON`);
      proxyReq.write(JSON.stringify(req.body));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      console.log(`[DEBUG PROXY] Sending as form-urlencoded`);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body)) {
        params.append(key, String(value));
      }
      proxyReq.write(params.toString());
    } else {
      // For other types, try to send as-is if it's a string, or JSON if object
      console.log(`[DEBUG PROXY] Sending as fallback type`);
      if (typeof req.body === 'string') {
        proxyReq.write(req.body);
      } else {
        proxyReq.write(JSON.stringify(req.body));
      }
    }
  } else {
    console.log(`[DEBUG PROXY] No request body to send`);
  }
  
  proxyReq.end();
  console.log(`[DEBUG PROXY] Request ended and sent to port ${port}`);
  console.log(`========== [DEBUG PROXY] Request Completed ==========\n`);
};

// Diagnostic endpoint - test if OpenChamber is accessible
router.get('/__diagnostic', validateUserProxy, async (req: ExpressRequest, res: Response) => {
  const userInfo = (req as any).userInfo || { username: 'unknown' };
  const port = (req as any).openChamberPort;
  
  console.log(`\n========== [DEBUG DIAGNOSTIC] Diagnostic Started ==========`);  
  console.log(`[DEBUG DIAGNOSTIC] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG DIAGNOSTIC] User: ${userInfo?.username}, Port: ${port}`);
  
  if (!port) {
    res.status(503).json({
      status: 'error',
      message: 'No OpenChamber instance available',
      user: userInfo?.username,
      port: null
    });
    return;
  }
  
  // Try to connect directly to OpenChamber
  const testOptions: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: port,
    path: '/',
    method: 'GET',
    timeout: 5000,
  };
  
  const startTime = Date.now();
  
  const testReq = http.request(testOptions, (testRes) => {
    const duration = Date.now() - startTime;
    let body = '';
    
    testRes.on('data', (chunk) => {
      body += chunk;
    });
    
    testRes.on('end', () => {
      res.json({
        status: 'ok',
        message: 'Direct connection to OpenChamber successful',
        user: userInfo?.username,
        port: port,
        responseTime: `${duration}ms`,
        openChamberStatus: testRes.statusCode,
        openChamberHeaders: testRes.headers,
        openChamberBodyPreview: body.substring(0, 500)
      });
    });
  });
  
  testReq.on('error', (err) => {
    const duration = Date.now() - startTime;
    res.status(502).json({
      status: 'error',
      message: 'Cannot connect to OpenChamber',
      user: userInfo?.username,
      port: port,
      responseTime: `${duration}ms`,
      error: err.message,
      errorCode: (err as any).code
    });
  });
  
  testReq.on('timeout', () => {
    testReq.destroy();
    res.status(504).json({
      status: 'error',
      message: 'Connection to OpenChamber timed out',
      user: userInfo?.username,
      port: port,
      timeout: 5000
    });
  });
  
  testReq.end();
});

router.all('/*', validateUserProxy, dynamicProxy);

// API router for WebSocket debugging
const apiTerminalRouter = Router();
apiTerminalRouter.get('/__diagnostic', validateUserProxy, async (req: ExpressRequest, res: Response) => {
  const userInfo = (req as any).userInfo || { username: 'unknown' };
  const port = (req as any).openChamberPort;
  
  console.log(`\n========== [DEBUG API DIAGNOSTIC] Diagnostic Started ==========`);  
  console.log(`[DEBUG API DIAGNOSTIC] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG API DIAGNOSTIC] User: ${userInfo?.username}, Port: ${port}`);
  
  if (!port) {
    res.status(503).json({
      status: 'error',
      message: 'No OpenChamber instance available',
      user: userInfo?.username,
      port: null
    });
    console.log(`========== [DEBUG API DIAGNOSTIC] Diagnostic Completed ==========\n`);
    return;
  }
  
  const testOptions: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: port,
    path: '/__diagnostic',
    method: 'GET',
    timeout: 5000,
  };
  
  const startTime = Date.now();
  
  const testReq = http.request(testOptions, (testRes) => {
    const duration = Date.now() - startTime;
    let body = '';
    
    testRes.on('data', (chunk) => {
      body += chunk;
      console.log(`[DEBUG API DIAGNOSTIC] Response chunk: ${chunk.length} bytes`);
    });
    
    testRes.on('end', () => {
      res.json({
        status: 'ok',
        message: 'Direct connection to OpenChamber API successful',
        user: userInfo?.username,
        port: port,
        responseTime: `${duration}ms`,
        openChamberStatus: testRes.statusCode,
        openChamberHeaders: testRes.headers,
        openChamberBodyPreview: body.substring(0, 500)
      });
      console.log(`[DEBUG API DIAGNOSTIC] API response: ${testRes.statusCode}`);
      console.log(`[DEBUG API DIAGNOSTIC] Response preview: ${body.substring(0, 200)}`);
      console.log(`========== [DEBUG API DIAGNOSTIC] Diagnostic Completed ==========\n`);
    });
  });
  
  testReq.on('error', (err) => {
    const duration = Date.now() - startTime;
    console.error(`[DEBUG API DIAGNOSTIC] Connection error: ${err.message}`);
    res.status(502).json({
      status: 'error',
      message: 'Cannot connect to OpenChamber API',
      user: userInfo?.username,
      port: port,
      responseTime: `${duration}ms`,
      error: err.message,
      errorCode: (err as any).code
    });
    console.log(`========== [DEBUG API DIAGNOSTIC] Diagnostic Completed ==========\n`);
  });
  
  testReq.on('timeout', () => {
    testReq.destroy();
    console.error(`[DEBUG API DIAGNOSTIC] Connection timeout`);
    res.status(504).json({
      status: 'error',
      message: 'Connection to OpenChamber API timed out',
      user: userInfo?.username,
      port: port,
      timeout: 5000
    });
    console.log(`========== [DEBUG API DIAGNOSTIC] Diagnostic Completed ==========\n`);
  });
  
  testReq.end();
});

const apiTerminalProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  console.log(`\n========== [DEBUG API PROXY] Request Started ==========`);  
  console.log(`[DEBUG API PROXY] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG API PROXY] Request: ${req.method} ${req.url}`);
  console.log(`[DEBUG API PROXY] Original URL (from request): ${req.url}`);
  console.log(`[DEBUG API PROXY] User: ${userInfo?.username || 'unknown'}, Port: ${port || 'none'}`);
  console.log(`[DEBUG API PROXY] Headers: ${JSON.stringify(req.headers, null, 2)}`);
  if (!port) {
    console.error(`[DEBUG API PROXY] No port assigned - OpenChamber instance not running`);
    res.status(503).json({ error: 'OpenChamber instance not available' });
    console.log(`========== [DEBUG API PROXY] Request Completed ==========\n`);
    return;
  }

  // For API requests, pass URL as-is (already without /chamber prefix)
  const targetPath = req.url || '/';
  const targetHost = '127.0.0.1';
  
  console.log(`[DEBUG API PROXY] Path transformation:`);
  console.log(`  - Original URL: ${req.url}`);
  console.log(`  - Target path: ${targetPath}`);
  console.log(`  - Target: ${targetHost}:${port}`);
  
  // Prepare headers
  const headers: any = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key !== 'host' && key !== 'content-length' && value !== undefined) {
      headers[key] = value;
    }
  }
  
  console.log(`[DEBUG API PROXY] Outgoing headers:`);
  console.log(JSON.stringify(headers, null, 2));
  
  const options: http.RequestOptions = {
    hostname: targetHost,
    port: port,
    path: targetPath,
    method: req.method,
    headers: headers,
    timeout: 60000,
    family: 4, // Force IPv4
  };

  const proxyReq = http.request(options, (proxyRes) => {
    console.log(`[DEBUG API PROXY] Response received: ${proxyRes.statusCode}`);
    
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[DEBUG API PROXY] Proxy request error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'OpenChamber instance unavailable',
        details: err.message,
        port: port,
        path: targetPath
      });
    }
  });

  proxyReq.on('timeout', () => {
    console.error('[DEBUG API PROXY] Request timeout');
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout' });
    }
  });

  // Handle request body
  if (req.body && Object.keys(req.body).length > 0) {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      proxyReq.write(JSON.stringify(req.body));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body)) {
        params.append(key, String(value));
      }
      proxyReq.write(params.toString());
    } else {
      if (typeof req.body === 'string') {
        proxyReq.write(req.body);
      } else {
        proxyReq.write(JSON.stringify(req.body));
      }
    }
  }
  
  proxyReq.end();
  console.log(`[DEBUG API PROXY] Request sent to port ${port}`);
};

apiTerminalRouter.all('/*', validateUserProxy, apiTerminalProxy);

// WebSocket upgrade handler
export const handleWebSocketUpgrade = async (
  request: http.IncomingMessage,
  socket: any,
  head: Buffer,
  server: http.Server
) => {
  console.log(`\n========== [DEBUG WS] WebSocket Upgrade Started ==========`);  
  console.log(`[DEBUG WS] Timestamp: ${new Date().toISOString()}`);
  console.log(`[DEBUG WS] Upgrade request received for: ${request.url}`);
  console.log(`[DEBUG WS] Request headers:`);
  console.log(JSON.stringify(request.headers, null, 2));
  console.log(`[DEBUG WS] Head buffer (hex): ${head.toString('hex').substring(0, 100)}`);
  console.log(`[DEBUG WS] Head buffer (text): ${head.toString('utf8').substring(0, 500)}`);
  
  // Check if this is a chamber request or OpenChamber API request
  const isChamberRequest = request.url?.startsWith('/chamber');
  const isOpenChamberApiRequest = request.url?.startsWith('/api/terminal/');
  
  if (!isChamberRequest && !isOpenChamberApiRequest) {
    console.log(`[DEBUG WS] Not a chamber or OpenChamber API request, skipping`);
    return false;
  }
  
  // Extract token from query string or cookies
  const requestUrl = request.url || '/';
  console.log(`[DEBUG WS] Request URL: ${requestUrl}`);
  console.log(`[DEBUG WS] Request headers.cookie: ${request.headers.cookie || 'none'}`);
  
  const url = new URL(requestUrl, `http://${request.headers.host}`);
  let token = url.searchParams.get('token');
  console.log(`[DEBUG WS] Token from URL param: ${token ? token.substring(0, 20) + '...' : 'none'}`);
  
  if (!token && request.headers.cookie) {
    const cookieMatch = request.headers.cookie.match(/token=([^;]+)/);
    if (cookieMatch) {
      token = cookieMatch[1];
      console.log(`[DEBUG WS] Token extracted from cookie: ${token.substring(0, 20)}...`);
    } else {
      console.log(`[DEBUG WS] No token found in cookies (cookie pattern not matched)`);
    }
  } else if (!token) {
    console.log(`[DEBUG WS] No token in URL params and no cookies present`);
  }
  
  if (!token) {
    console.log(`[DEBUG WS] No token found, rejecting WebSocket`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const payload = JWTService.verifyToken(token);
  if (!payload) {
    console.log(`[DEBUG WS] Invalid token, rejecting WebSocket`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const user = userService.getUser(payload.username);
  if (!user) {
    console.log(`[DEBUG WS] User not found, rejecting WebSocket`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const userData = {
    username: user.username,
    homeDir: `/home/${user.username}`
  };
  
  try {
    const instance = await openChamberService.getOrStartInstance(userData as any);
    const port = instance.port;
    
    if (!port) {
      console.log(`[DEBUG WS] No port available for user ${user.username}`);
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return true;
    }
    
    console.log(`[DEBUG WS] Proxying WebSocket to port ${port}`);
    
    // Transform URL - remove /chamber prefix or /api/terminal prefix if present
    let targetPath = request.url || '/';
    const originalPath = targetPath;
    if (targetPath.startsWith('/chamber')) {
      targetPath = targetPath.substring('/chamber'.length) || '/';
    }
    if (targetPath.startsWith('/api/terminal')) {
      targetPath = targetPath.substring('/api/terminal'.length) || '/';
    }
    
    console.log(`[DEBUG WS] Path transformation:`);
    console.log(`  - Original path: ${originalPath}`);
    console.log(`  - Target path: ${targetPath}`);
    
    // Create proxy connection
    const proxySocket = new net.Socket();
    let proxyToClientBytes = 0;
    let clientToProxyBytes = 0;
    
    proxySocket.connect(port, '127.0.0.1', () => {
      console.log(`[DEBUG WS] Connected to OpenChamber on port ${port}`);
      
      // Build headers for WebSocket upgrade - preserve original headers and add required ones
      const upgradeHeader = request.headers['upgrade'] || 'websocket';
      const connectionHeader = request.headers['connection'] || 'upgrade';
      const secWebSocketKey = request.headers['sec-websocket-key'] || '';
      const secWebSocketVersion = request.headers['sec-websocket-version'] || '13';
      const secWebSocketProtocol = request.headers['sec-websocket-protocol'] || '';
      const secWebSocketExtensions = request.headers['sec-websocket-extensions'] || '';
      
      let headerStr = `${request.method} ${targetPath} HTTP/1.1\r\n`;
      headerStr += `Host: 127.0.0.1:${port}\r\n`;
      headerStr += `X-MultiChamber-User: ${user.username}\r\n`;
      const isChamberWs = targetPath.startsWith('/chamber') || originalPath.startsWith('/chamber');
      headerStr += `X-Forwarded-Prefix: ${isChamberWs ? '/chamber' : '/api/terminal'}\r\n`;
      headerStr += `Upgrade: ${upgradeHeader}\r\n`;
      headerStr += `Connection: ${connectionHeader}\r\n`;
      
      if (secWebSocketKey) {
        headerStr += `Sec-WebSocket-Key: ${secWebSocketKey}\r\n`;
      }
      if (secWebSocketVersion) {
        headerStr += `Sec-WebSocket-Version: ${secWebSocketVersion}\r\n`;
      }
      if (secWebSocketProtocol) {
        headerStr += `Sec-WebSocket-Protocol: ${secWebSocketProtocol}\r\n`;
      }
      if (secWebSocketExtensions) {
        headerStr += `Sec-WebSocket-Extensions: ${secWebSocketExtensions}\r\n`;
      }
      
      // Add other headers from original request
      for (const [key, value] of Object.entries(request.headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'host' && 
            lowerKey !== 'upgrade' && 
            lowerKey !== 'connection' && 
            lowerKey !== 'sec-websocket-key' &&
            lowerKey !== 'sec-websocket-version' &&
            lowerKey !== 'sec-websocket-protocol' &&
            lowerKey !== 'sec-websocket-extensions' &&
            lowerKey !== 'content-length' &&
            value !== undefined) {
          headerStr += `${key}: ${value}\r\n`;
        }
      }
      
      headerStr += `\r\n`;
      
      console.log(`[DEBUG WS] Upgrading proxy connection...`);
      console.log(`[DEBUG WS] Writing ${headerStr.length} bytes of headers`);
      console.log(`[DEBUG WS] Writing ${head.length} bytes of head`);
      
      proxySocket.write(headerStr);
      proxySocket.write(head);
      
      // Add debug logging to pipe streams
      proxySocket.on('data', (chunk: Buffer) => {
        proxyToClientBytes += chunk.length;
        console.log(`[DEBUG WS] Data from proxy to client: ${chunk.length} bytes (total: ${proxyToClientBytes})`);
        console.log(`[DEBUG WS] Data preview: ${chunk.toString('utf8').substring(0, 200)}`);
      });
      
      socket.on('data', (chunk: Buffer) => {
        clientToProxyBytes += chunk.length;
        console.log(`[DEBUG WS] Data from client to proxy: ${chunk.length} bytes (total: ${clientToProxyBytes})`);
        console.log(`[DEBUG WS] Data preview: ${chunk.toString('utf8').substring(0, 200)}`);
      });
      
      // Pipe the sockets together
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
      
      console.log(`[DEBUG WS] Sockets piped successfully`);
    });
    
    proxySocket.on('error', (err: Error) => {
      console.error(`[DEBUG WS] Proxy socket error:`, err.message);
      socket.destroy();
    });
    
    socket.on('error', (err: Error) => {
      console.error(`[DEBUG WS] Client socket error:`, err.message);
      proxySocket.destroy();
    });
    
    proxySocket.on('end', () => {
      console.log(`[DEBUG WS] Proxy socket ended (total data to client: ${proxyToClientBytes} bytes)`);
    });
    
    socket.on('end', () => {
      console.log(`[DEBUG WS] Client socket ended (total data to proxy: ${clientToProxyBytes} bytes)`);
    });
    
    return true;
  } catch (error) {
    console.error(`[DEBUG WS] Error handling upgrade:`, error);
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    socket.destroy();
    return true;
  }
};

export { apiTerminalRouter };
export default router;
