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
  if (!req.user) {
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = JWTService.verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const user = userService.getUser(payload.username);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    (req as any).userInfo = {
      username: user.username,
      isAdmin: user.isAdmin,
    };
  } else {
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
  
  const instance = await openChamberService.getOrStartInstance(user as any);
  (req as any).openChamberPort = instance.port;
  
  next();
};

const dynamicProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  console.log(`[DEBUG PROXY] Request received: ${req.method} ${req.url}`);
  console.log(`[DEBUG PROXY] User: ${userInfo?.username || 'unknown'}, Port: ${port || 'none'}`);
  console.log(`[DEBUG PROXY] Headers:`, JSON.stringify(req.headers, null, 2));
  
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
  </style>
</head>
<body>
  <div class="container">
    <h1>🖥️ OpenChamber</h1>
    <p>Welcome to your workspace, <span class="user">${userInfo?.username || 'User'}</span></p>
    <p>OpenChamber is starting or not installed.</p>
    <p><small>Port: Not assigned</small></p>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(placeholderHtml);
    return;
  }

  // Correctly handle path transformation
  const originalUrl = req.url || '/';
  let targetPath = originalUrl;
  
  // Remove /mc13/chamber prefix
  if (targetPath.startsWith('/mc13/chamber')) {
    targetPath = targetPath.substring('/mc13/chamber'.length) || '/';
  }
  
  const targetHost = '127.0.0.1';
  
  console.log(`[DEBUG PROXY] Original URL: ${originalUrl}`);
  console.log(`[DEBUG PROXY] Target path: ${targetPath}`);
  console.log(`[DEBUG PROXY] Target: ${targetHost}:${port}`);
  
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
  headers['X-Forwarded-Prefix'] = '/mc13/chamber';
  headers['X-Forwarded-Uri'] = originalUrl;
  
  console.log(`[DEBUG PROXY] Outgoing headers:`, JSON.stringify(headers, null, 2));
  
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
    console.log(`[DEBUG PROXY] Response received: ${proxyRes.statusCode}`);
    console.log(`[DEBUG PROXY] Response headers:`, JSON.stringify(proxyRes.headers, null, 2));
    
    const contentType = proxyRes.headers['content-type'] || '';
    
    if (contentType.includes('text/html')) {
      const chunks: Buffer[] = [];
      
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        console.log(`[DEBUG PROXY] HTML body length: ${body.length}`);
        
        // Enhanced path rewriting
        let rewrittenBody = body
          .replace(/(href=["'])\//g, '$1/mc13/chamber/')
          .replace(/(src=["'])\//g, '$1/mc13/chamber/')
          .replace(/(action=["'])\//g, '$1/mc13/chamber/')
          .replace(/(url\()\//g, '$1/mc13/chamber/')
          .replace(/location\.origin/g, "'http://localhost:8080/mc13/chamber'")
          // Handle relative URLs in CSS
          .replace(/(url\s*\(\s*["']?)\//g, '$1/mc13/chamber/');
        
        const headers = { ...proxyRes.headers };
        delete headers['x-frame-options'];
        res.writeHead(proxyRes.statusCode || 200, {
          ...headers,
          'content-length': Buffer.byteLength(rewrittenBody),
        });
        res.end(rewrittenBody);
        console.log(`[DEBUG PROXY] HTML response sent`);
      });
    } else {
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);
      console.log(`[DEBUG PROXY] Non-HTML response piped`);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('[DEBUG PROXY] Proxy request error:', err.message);
    console.error('[DEBUG PROXY] Error stack:', err.stack);
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
    console.error('[DEBUG PROXY] Request timeout');
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout' });
    }
  });

  // Handle request body properly
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[DEBUG PROXY] Sending body:`, JSON.stringify(req.body).substring(0, 200));
    
    // Check content type to determine how to send body
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
      // For other types, try to send as-is if it's a string, or JSON if object
      if (typeof req.body === 'string') {
        proxyReq.write(req.body);
      } else {
        proxyReq.write(JSON.stringify(req.body));
      }
    }
  }
  
  proxyReq.end();
  console.log(`[DEBUG PROXY] Request sent to port ${port}`);
};

// Diagnostic endpoint - test if OpenChamber is accessible
router.get('/__diagnostic', async (req: ExpressRequest, res: Response) => {
  const userInfo = (req as any).userInfo || { username: 'unknown' };
  const port = (req as any).openChamberPort;
  
  console.log(`[DEBUG DIAGNOSTIC] Diagnostic request for user: ${userInfo?.username}, port: ${port}`);
  
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

// Create a separate router for API terminal proxy
const apiTerminalRouter = Router();

// API Terminal proxy - doesn't rewrite HTML, just forwards requests
const apiTerminalProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  console.log(`[DEBUG API PROXY] Request received: ${req.method} ${req.url}`);
  console.log(`[DEBUG API PROXY] User: ${userInfo?.username || 'unknown'}, Port: ${port || 'none'}`);
  
  if (!port) {
    res.status(503).json({ error: 'OpenChamber instance not available' });
    return;
  }

  // For API requests, pass URL as-is (already without /mc13/chamber prefix)
  const targetPath = req.url || '/';
  const targetHost = '127.0.0.1';
  
  console.log(`[DEBUG API PROXY] Target path: ${targetPath}`);
  console.log(`[DEBUG API PROXY] Target: ${targetHost}:${port}`);
  
  // Prepare headers
  const headers: any = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key !== 'host' && key !== 'content-length' && value !== undefined) {
      headers[key] = value;
    }
  }
  
  headers['host'] = `${targetHost}:${port}`;
  headers['X-MultiChamber-User'] = userInfo?.username || '';
  headers['X-MultiChamber-Admin'] = userInfo?.isAdmin ? 'true' : 'false';
  headers['X-Forwarded-Prefix'] = '/mc13/api/terminal';
  headers['X-Forwarded-Uri'] = targetPath;
  
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
  console.log(`[DEBUG WS] Upgrade request received for: ${request.url}`);
  
  // Check if this is a chamber request or OpenChamber API request
  const isChamberRequest = request.url?.startsWith('/mc13/chamber');
  const isOpenChamberApiRequest = request.url?.startsWith('/mc13/api/terminal/');
  
  if (!isChamberRequest && !isOpenChamberApiRequest) {
    console.log(`[DEBUG WS] Not a chamber or OpenChamber API request, skipping`);
    return false;
  }
  
  // Extract token from query string or cookies
  const requestUrl = request.url || '/';
  const url = new URL(requestUrl, `http://${request.headers.host}`);
  let token = url.searchParams.get('token');
  
  if (!token && request.headers.cookie) {
    const cookieMatch = request.headers.cookie.match(/token=([^;]+)/);
    if (cookieMatch) {
      token = cookieMatch[1];
    }
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
    
    // Transform URL - remove /mc13/chamber prefix or /mc13/api/terminal prefix if present
    let targetPath = request.url || '/';
    if (targetPath.startsWith('/mc13/chamber')) {
      targetPath = targetPath.substring('/mc13/chamber'.length) || '/';
    }
    
    console.log(`[DEBUG WS] Original URL: ${request.url}, Target path: ${targetPath}`);
    
    // Create proxy connection
    const proxySocket = new net.Socket();
    
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
      headerStr += `X-Forwarded-Prefix: /mc13/chamber\r\n`;
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
      
      proxySocket.write(headerStr);
      proxySocket.write(head);
      
      // Pipe the sockets together
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    
    proxySocket.on('error', (err: Error) => {
      console.error(`[DEBUG WS] Proxy socket error:`, err.message);
      socket.destroy();
    });
    
    socket.on('error', (err: Error) => {
      console.error(`[DEBUG WS] Client socket error:`, err.message);
      proxySocket.destroy();
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
