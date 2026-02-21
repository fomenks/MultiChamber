import { Router } from 'express';
import { UserService } from '../services/userService.js';
import { OpenChamberService } from '../services/openChamberService.js';
import { JWTService } from '../services/jwtService.js';
import { adminMiddleware } from '../middleware/auth.js';
import type { Request, Response } from 'express';

const router = Router();
const userService = new UserService();
const openChamberService = new OpenChamberService();

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  // Validate credentials
  const isValid = userService.validateCredentials(username, password);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = userService.getUser(username);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  try {
    // Get or start OpenChamber instance (optional - continue if fails)
    let instance = null;
    let openChamberPort: number | null = null;
    
    try {
      instance = await openChamberService.getOrStartInstance(user);
      openChamberPort = instance.port;
    } catch (ocError) {
      console.warn('OpenChamber not available:', ocError);
    }

    // Generate JWT
    const token = JWTService.generateToken(user);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    res.json({
      token,
      user: {
        username: user.username,
        isAdmin: user.isAdmin,
        homeDir: user.homeDir,
      },
      openChamberPort,
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = userService.getUser(req.user.username);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const instance = openChamberService.getInstance(user.username);

  res.json({
    user: {
      username: user.username,
      isAdmin: user.isAdmin,
      homeDir: user.homeDir,
    },
    openChamberPort: instance?.port,
  });
});

// Create user (admin only)
router.post('/users', adminMiddleware, (req: Request, res: Response) => {
  const { username, password, isAdmin } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  try {
    const user = userService.createUser({ username, password, isAdmin });
    res.status(201).json({
      user: {
        username: user.username,
        isAdmin: user.isAdmin,
        homeDir: user.homeDir,
      },
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// List users (admin only)
router.get('/users', adminMiddleware, (req: Request, res: Response) => {
  const users = userService.getAllUsers().map(user => ({
    username: user.username,
    isAdmin: user.isAdmin,
    homeDir: user.homeDir,
    uid: user.uid,
  }));

  res.json({ users });
});

// Delete user (admin only)
router.delete('/users/:username', adminMiddleware, (req: Request, res: Response) => {
  const { username } = req.params;

  try {
    // Stop OpenChamber instance if running
    openChamberService.stopInstance(username);
    
    userService.deleteUser(username);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Change password
router.post('/change-password', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password required' });
    return;
  }

  // Verify current password
  const isValid = userService.validateCredentials(req.user.username, currentPassword);
  if (!isValid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  try {
    userService.changePassword(req.user.username, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
