import { Router } from 'express';
import * as http from 'http';
import { OpenChamberService } from '../services/openChamberService.js';
import { UserService } from '../services/userService.js';
import { JWTService } from '../services/jwtService.js';
import type { Request as ExpressRequest, Response, NextFunction } from 'express';

const router = Router();
const openChamberService = new OpenChamberService();
const userService = new UserService();

const validateUserProxy = async (req: ExpressRequest, res: Response, next: NextFunction): Promise<void> => {
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

  try {
    const instance = await openChamberService.getOrStartInstance(user);
    (req as any).openChamberPort = instance.port;
  } catch (error) {
    console.warn('OpenChamber not available for user:', user.username);
    (req as any).openChamberPort = null;
  }
  
  next();
};

const dynamicProxy = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
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

  const targetPath = (req.url || '/').replace('/chamber', '') || '/';
  const targetHost = '127.0.0.1';
  
  const options: http.RequestOptions = {
    hostname: targetHost,
    port: port,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${targetHost}:${port}`,
      'X-MultiChamber-User': userInfo?.username || '',
      'X-MultiChamber-Admin': userInfo?.isAdmin ? 'true' : 'false',
      'X-Forwarded-Prefix': '/chamber',
      'X-Forwarded-Uri': targetPath,
    },
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
        const rewrittenBody = body
          .replace(/(href=["'])\//g, '$1/chamber/')
          .replace(/(src=["'])\//g, '$1/chamber/')
          .replace(/(action=["'])\//g, '$1/chamber/')
          .replace(/(url\()\//g, '$1/chamber/')
          .replace(/location\.origin/g, "location.origin + '/chamber'");
        
        res.writeHead(proxyRes.statusCode || 200, {
          ...proxyRes.headers,
          'content-length': Buffer.byteLength(rewrittenBody),
        });
        res.end(rewrittenBody);
      });
    } else {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'OpenChamber instance unavailable' });
    }
  });

  // Handle request body - Express has already parsed it
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
};

router.all('/*', validateUserProxy, dynamicProxy);

export default router;
