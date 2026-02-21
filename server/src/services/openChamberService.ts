import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import type { OpenChamberInstance, User } from '../types/index.js';

const MIN_PORT = 10000;
const MAX_PORT = 20000;
const PORT_FILE = '/app/data/openchamber-ports.json';

export class OpenChamberService {
  private instances: Map<string, OpenChamberInstance> = new Map();
  private portToUser: Map<number, string> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  constructor() {
    this.loadPortMappings();
    this.startHealthCheck();
  }

  private loadPortMappings(): void {
    try {
      if (fs.existsSync(PORT_FILE)) {
        const data = JSON.parse(fs.readFileSync(PORT_FILE, 'utf-8'));
        for (const [username, instance] of Object.entries(data)) {
          this.instances.set(username, instance as OpenChamberInstance);
          this.portToUser.set((instance as OpenChamberInstance).port, username);
        }
      }
    } catch (error) {
      console.error('Error loading port mappings:', error);
    }
  }

  private savePortMappings(): void {
    try {
      const data: Record<string, OpenChamberInstance> = {};
      for (const [username, instance] of this.instances) {
        data[username] = instance;
      }
      fs.mkdirSync(path.dirname(PORT_FILE), { recursive: true });
      fs.writeFileSync(PORT_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving port mappings:', error);
    }
  }

  private async findAvailablePort(): Promise<number> {
    for (let port = MIN_PORT; port <= MAX_PORT; port++) {
      if (!this.portToUser.has(port)) {
        // Check if port is actually available
        const isAvailable = await this.checkPortAvailable(port);
        if (isAvailable) {
          return port;
        }
      }
    }
    throw new Error('No available ports');
  }

  private checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
      server.on('error', () => resolve(false));
    });
  }

  async getOrStartInstance(user: User): Promise<OpenChamberInstance> {
    // Check if there's already an instance for this user
    const existing = this.instances.get(user.username);
    if (existing && await this.isInstanceHealthy(existing)) {
      existing.status = 'running';
      return existing;
    }

    // Start new instance
    return this.startInstance(user);
  }

  private async isInstanceHealthy(instance: OpenChamberInstance): Promise<boolean> {
    // Check if process is still running
    if (instance.pid) {
      try {
        process.kill(instance.pid, 0); // Check if process exists
      } catch {
        return false;
      }
    }

    // Check if port responds
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(instance.port, '127.0.0.1');
    });
  }

  private async startInstance(user: User): Promise<OpenChamberInstance> {
    const port = await this.findAvailablePort();
    const workspaceDir = path.join(user.homeDir, 'workspace');
    
    // Ensure workspace exists
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Set up environment for OpenChamber
    const env = {
      ...process.env,
      HOME: user.homeDir,
      USER: user.username,
      OPENCODE_PORT: port.toString(),
      OPENCODE_HOST: '127.0.0.1',
      FORCE_COLOR: '1',
      TERM: 'xterm-256color',
    };

    // Start OpenCode process as the user
    const opencodeProcess = spawn('su', [
      '-',
      user.username,
      '-c',
      `cd ${workspaceDir} && /app/opencode/start.sh || cd /app/opencode/server && bun start.js --port ${port} --host 127.0.0.1`,
    ], {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const instance: OpenChamberInstance = {
      port,
      pid: opencodeProcess.pid!,
      username: user.username,
      startTime: new Date(),
      status: 'starting',
    };

    this.instances.set(user.username, instance);
    this.portToUser.set(port, user.username);
    this.processes.set(user.username, opencodeProcess);

    // Save port mapping
    this.savePortMappings();

    // Wait for OpenChamber to be ready
    await this.waitForOpenChamber(port);
    
    instance.status = 'running';

    // Handle process exit
    opencodeProcess.on('exit', (code) => {
      console.log(`OpenChamber for ${user.username} exited with code ${code}`);
      this.cleanupInstance(user.username);
    });

    // Log output for debugging
    opencodeProcess.stdout?.on('data', (data) => {
      console.log(`[${user.username}] ${data.toString().trim()}`);
    });

    opencodeProcess.stderr?.on('data', (data) => {
      console.error(`[${user.username}] ${data.toString().trim()}`);
    });

    return instance;
  }

  private async waitForOpenChamber(port: number, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const isReady = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.connect(port, '127.0.0.1');
      });

      if (isReady) {
        // Give it a bit more time to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('Timeout waiting for OpenChamber to start');
  }

  private cleanupInstance(username: string): void {
    const instance = this.instances.get(username);
    if (instance) {
      this.portToUser.delete(instance.port);
      this.instances.delete(username);
      this.processes.delete(username);
      this.savePortMappings();
    }
  }

  stopInstance(username: string): void {
    const process = this.processes.get(username);
    if (process) {
      process.kill('SIGTERM');
      // Force kill after 10 seconds
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 10000);
    }
    this.cleanupInstance(username);
  }

  getInstance(username: string): OpenChamberInstance | null {
    return this.instances.get(username) || null;
  }

  getAllInstances(): OpenChamberInstance[] {
    return Array.from(this.instances.values());
  }

  private startHealthCheck(): void {
    // Check instance health every 30 seconds
    setInterval(async () => {
      for (const [username, instance] of this.instances) {
        const isHealthy = await this.isInstanceHealthy(instance);
        if (!isHealthy) {
          console.log(`Instance for ${username} is unhealthy, cleaning up`);
          this.cleanupInstance(username);
        }
      }
    }, 30000);
  }
}
