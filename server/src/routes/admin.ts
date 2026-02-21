import { Router } from 'express';
import { UserService } from '../services/userService.js';
import { OpenChamberService } from '../services/openChamberService.js';
import { adminMiddleware } from '../middleware/auth.js';
import * as os from 'os';
import type { Request, Response } from 'express';

const router = Router();
const userService = new UserService();
const openChamberService = new OpenChamberService();

// Get system status
router.get('/status', adminMiddleware, (req: Request, res: Response) => {
  const users = userService.getAllUsers();
  const instances = openChamberService.getAllInstances();
  
  // Get system uptime
  const uptime = os.uptime();
  
  // Get memory usage
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  
  // Get CPU info
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg();

  res.json({
    system: {
      uptime,
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100),
      },
      cpu: {
        count: cpuCount,
        loadAvg,
      },
      platform: os.platform(),
      release: os.release(),
    },
    users: {
      total: users.length,
      list: users.map(u => ({
        username: u.username,
        isAdmin: u.isAdmin,
        homeDir: u.homeDir,
      })),
    },
    openChamber: {
      activeInstances: instances.length,
      instances: instances.map(i => ({
        username: i.username,
        port: i.port,
        pid: i.pid,
        startTime: i.startTime,
        status: i.status,
      })),
    },
  });
});

// Restart OpenChamber instance for a user
router.post('/restart-instance/:username', adminMiddleware, async (req: Request, res: Response) => {
  const { username } = req.params;
  
  // Stop existing instance
  openChamberService.stopInstance(username);
  
  // Get user and start new instance
  const user = userService.getUser(username);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  try {
    const instance = await openChamberService.getOrStartInstance(user);
    res.json({
      message: 'Instance restarted successfully',
      instance: {
        username: instance.username,
        port: instance.port,
        pid: instance.pid,
        status: instance.status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Stop OpenChamber instance for a user
router.post('/stop-instance/:username', adminMiddleware, (req: Request, res: Response) => {
  const { username } = req.params;
  
  openChamberService.stopInstance(username);
  res.json({ message: 'Instance stopped successfully' });
});

// Get logs (placeholder - would need actual log implementation)
router.get('/logs', adminMiddleware, (req: Request, res: Response) => {
  const { lines = '100' } = req.query;
  
  // This is a placeholder - in production you'd read from actual log files
  res.json({
    logs: [
      { timestamp: new Date().toISOString(), level: 'info', message: 'System initialized' },
    ],
  });
});

export default router;
