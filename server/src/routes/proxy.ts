import { Router } from 'express';
import * as http from 'http';
import * as net from 'net';
import { openChamberService } from '../services/openChamberSingleton.js';
import { UserService } from '../services/userService.js';
import { JWTService } from '../services/jwtService.js';
import type { Request as ExpressRequest, Response, NextFunction } from 'express';

const router = Router();
const userService = new UserService();

const validateUserProxy = async (req: ExpressRequest, res: Response, next: NextFunction): Promise<void> => {
  // Skip auth for OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

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
  const user = userService.getUser(userInfo.username);
  const homeDir = user?.homeDir || `/home/${userInfo.username}`;
  
  const instance = await openChamberService.getOrStartInstance({
    username: userInfo.username,
    homeDir: homeDir
  } as any);
  (req as any).openChamberPort = instance.port;
  
  next();
};

const dynamicProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  let port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  // Handle OPTIONS requests - proxy to OpenChamber for CORS
  if (req.method === 'OPTIONS') {
    // For OPTIONS, try to get port from token if available
    if (!port) {
      let token = req.headers.authorization?.replace('Bearer ', '');
      if (!token && req.cookies?.token) {
        token = req.cookies.token;
      }
      if (token) {
        const payload = JWTService.verifyToken(token);
        if (payload) {
          const user = userService.getUser(payload.username);
          if (user) {
            const instance = openChamberService.getInstance(user.username);
            if (instance) {
              port = instance.port;
            }
          }
        }
      }
    }
    // If still no port, try admin as fallback for OPTIONS
    if (!port) {
      const adminInstance = openChamberService.getInstance('admin');
      if (adminInstance) {
        port = adminInstance.port;
      }
    }
  }
  
  if (!port) {
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
  
  const targetHost = '127.0.0.1';
  
  // Prepare headers - remove Express-specific headers that might cause issues
  const headers: any = {};
  for (const [key, value] of Object.entries(req.headers)) {
    // Skip Express internal headers, host, and authorization (MultiChamber handles auth)
    if (key !== 'host' && key !== 'content-length' && key !== 'authorization' && value !== undefined) {
      headers[key] = value;
    }
  }
  
  headers['host'] = `${targetHost}:${port}`;
  
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
    const contentType = proxyRes.headers['content-type'] || '';
    
    if (contentType.includes('text/html')) {
      const chunks: Buffer[] = [];
      
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        
        // Enhanced path rewriting - pass through as-is since proxy is at root
        let rewrittenBody = body;
        
        const headers = { ...proxyRes.headers };
        delete headers['x-frame-options'];
        res.writeHead(proxyRes.statusCode || 200, {
          ...headers,
          'content-length': Buffer.byteLength(rewrittenBody),
        });
        res.end(rewrittenBody);
      });
    } else {
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
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
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout' });
    }
  });

  // Handle request body properly
  if (req.body && Object.keys(req.body).length > 0) {
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
};

router.all('/*', validateUserProxy, dynamicProxy);

// Create a separate router for API terminal proxy
const apiTerminalRouter = Router();

// API Terminal proxy - doesn't rewrite HTML, just forwards requests
const apiTerminalProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  
  if (!port) {
    res.status(503).json({ error: 'OpenChamber instance not available' });
    return;
  }

  // For API requests, pass URL as-is (already without /mc13/chamber prefix)
  const targetPath = req.url || '/';
  const targetHost = '127.0.0.1';
  
  // Prepare headers - remove authorization (MultiChamber handles auth)
  const headers: any = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key !== 'host' && key !== 'content-length' && key !== 'authorization' && value !== undefined) {
      headers[key] = value;
    }
  }
  
  headers['host'] = `${targetHost}:${port}`;
  
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
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
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
};

apiTerminalRouter.all('/*', validateUserProxy, apiTerminalProxy);

// WebSocket upgrade handler
export const handleWebSocketUpgrade = async (
  request: http.IncomingMessage,
  socket: any,
  head: Buffer,
  server: http.Server
) => {
  // Check if this is NOT a /mc13 request (everything else goes to chamber)
  const isChamberRequest = !request.url?.startsWith('/mc13');
  
  if (!isChamberRequest) {
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
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const payload = JWTService.verifyToken(token);
  if (!payload) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const user = userService.getUser(payload.username);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return true;
  }
  
  const userData = {
    username: user.username,
    homeDir: user.homeDir || `/home/${user.username}`
  };
  
  try {
    const instance = await openChamberService.getOrStartInstance(userData as any);
    const port = instance.port;
    
    if (!port) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return true;
    }
    
    // Transform URL - use as-is since proxy is at root
    let targetPath = request.url || '/';
    
    // Create proxy connection
    const proxySocket = new net.Socket();
    
    proxySocket.connect(port, '127.0.0.1', () => {
      // Build headers for WebSocket upgrade - preserve original headers and add required ones
      const upgradeHeader = request.headers['upgrade'] || 'websocket';
      const connectionHeader = request.headers['connection'] || 'upgrade';
      const secWebSocketKey = request.headers['sec-websocket-key'] || '';
      const secWebSocketVersion = request.headers['sec-websocket-version'] || '13';
      const secWebSocketProtocol = request.headers['sec-websocket-protocol'] || '';
      const secWebSocketExtensions = request.headers['sec-websocket-extensions'] || '';
      
      let headerStr = `${request.method} ${targetPath} HTTP/1.1\r\n`;
      headerStr += `Host: 127.0.0.1:${port}\r\n`;
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
      
      // Add other headers from original request (exclude authorization - MultiChamber handles auth)
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
            lowerKey !== 'authorization' &&
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
      socket.destroy();
    });
    
    socket.on('error', (err: Error) => {
      proxySocket.destroy();
    });
    
    return true;
  } catch (error) {
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    socket.destroy();
    return true;
  }
};

export { apiTerminalRouter };
export default router;
