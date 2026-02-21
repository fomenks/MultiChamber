import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { OpenChamberService } from '../services/openChamberService.js';
import { UserService } from '../services/userService.js';
import { JWTService } from '../services/jwtService.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();
const openChamberService = new OpenChamberService();
const userService = new UserService();

// Middleware to validate user and get their OpenChamber port
const validateUserProxy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Get token from header or cookie
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

  // Attach user info
  (req as any).userInfo = {
    username: user.username,
    isAdmin: user.isAdmin,
  };

  // Try to get OpenChamber instance (optional - continue even if fails)
  try {
    const instance = await openChamberService.getOrStartInstance(user);
    (req as any).openChamberPort = instance.port;
  } catch (error) {
    console.warn('OpenChamber not available for user:', user.username);
    (req as any).openChamberPort = null;
  }
  
  next();
};

// Create proxy middleware dynamically based on user's OpenChamber port
const dynamicProxy = (req: Request, res: Response, next: NextFunction) => {
  const port = (req as any).openChamberPort;
  const userInfo = (req as any).userInfo;
  
  // If OpenChamber is not available, serve a placeholder page
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

  const proxyMiddleware = createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'OpenChamber instance unavailable' });
      }
    },
    onProxyReq: (proxyReq, req) => {
      // Add user info header for OpenChamber to identify user
      const userInfo = (req as any).userInfo;
      if (userInfo) {
        proxyReq.setHeader('X-MultiChamber-User', userInfo.username);
        proxyReq.setHeader('X-MultiChamber-Admin', userInfo.isAdmin ? 'true' : 'false');
      }
    },
  });

  proxyMiddleware(req, res, next);
};

// Proxy all requests to user's OpenChamber instance
router.all('*', validateUserProxy, dynamicProxy);

export default router;
