import type { Request, Response, NextFunction } from 'express';
import { JWTService } from '../services/jwtService.js';
import { UserService } from '../services/userService.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string;
        isAdmin: boolean;
      };
    }
  }
}

const userService = new UserService();

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip auth for login, health, static files, chamber proxy, and root
  const publicPaths = [
    '/mc13/api/auth/login',
    '/mc13/health',
    '/mc13',
    '/mc13/',
  ];
  
  // Skip auth for static files (assets, vite.svg, favicon, etc.)
  if (
    publicPaths.includes(req.path) ||
    req.path.startsWith('/mc13/assets/') ||
    req.path.startsWith('/assets/') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.jpg') ||
    req.path.endsWith('.jpeg') ||
    req.path.endsWith('.ico') ||
    req.path.endsWith('.woff') ||
    req.path.endsWith('.woff2') ||
    req.path.endsWith('.ttf')
  ) {
    next();
    return;
  }

  // Check for token in Authorization header or cookie
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
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Verify user still exists
  const user = userService.getUser(payload.username);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.user = {
    username: payload.username,
    isAdmin: payload.isAdmin,
  };

  next();
};

export const adminMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
