import { execSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import type { OpenChamberInstance, User } from '../types/index.js';

const MIN_PORT = 10000;
const MAX_PORT = 20000;
const PORT_FILE = '/app/data/openchamber-ports.json';

export class OpenChamberService {
  private instances: Map<string, OpenChamberInstance> = new Map();
  private portToUser: Map<number, string> = new Map();

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

  async getOrStartInstance(user: User): Promise<OpenChamberInstance> {
    const existingInstance = this.instances.get(user.username);
    
     if (existingInstance && existingInstance.status === 'running') {
       const isHealthy = await this.isInstanceHealthy(existingInstance);
       if (isHealthy) {
         return existingInstance;
       }
     }

    const username = user.username;
    
    const port = await this.startInstanceUsingScript(user);
    
    const instance: OpenChamberInstance = {
      port,
      pid: this.getPidFromPidFile(username),
      username: username,
      startTime: new Date(),
      status: 'running',
    };

    this.instances.set(username, instance);
    this.portToUser.set(port, username);

    this.savePortMappings();

    console.log(`OpenChamber instance for ${username} is now running on port ${port}`);

    return instance;
  }

  private isInstanceHealthy(instance: OpenChamberInstance): Promise<boolean> {
    const port = instance.port;
    console.log(`Health check for OpenChamber instance on port ${port}`);

    if (instance.status === 'starting') {
      console.log(`Instance on port ${port} is still starting`);
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        console.log(`Health check passed for port ${port}`);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        console.log(`Health check failed for port ${port}: ${(err as Error).message}`);
        resolve(false);
      });
      
      socket.on('timeout', () => {
        console.log(`Health check timed out for port ${port}`);
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, '127.0.0.1');
    });
  }

  private isPortAvailable(port: number): boolean {
    try {
      const socket = new net.Socket();
      socket.connect(port, '127.0.0.1');
      socket.destroy();
      return false;
    } catch {
      return true;
    }
  }

  private async waitForPortReady(port: number, timeoutMs: number = 30000): Promise<boolean> {
    console.log(`Waiting for port ${port} to be ready (timeout: ${timeoutMs}ms)`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (this.isPortAvailable(port)) {
        console.log(`Port ${port} is not available (in use), waiting...`);
      } else {
        console.log(`Port ${port} is now available`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.error(`Timeout waiting for port ${port} to be ready after ${timeoutMs}ms`);
    return false;
  }

  private async startInstanceUsingScript(user: User): Promise<number> {
    try {
      const username = user.username;
      console.log(`Starting OpenChamber for user ${username} using runOC.sh`);
      
      const result = execSync(`/usr/local/bin/runOC.sh ${username}`, { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Extract port from the last line of output
      const lines = result.trim().split('\n');
      const port = parseInt(lines[lines.length - 1].trim(), 10);
      
      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        console.error(`Failed to parse port from output. Full output:\n${result}`);
        throw new Error(`Invalid port returned: ${port}`);
      }

      console.log(`Started OpenChamber instance for ${username} on port ${port}`);

      const portReady = await this.waitForPortReady(port, 30000);
      if (!portReady) {
        throw new Error(`Port ${port} did not become ready within 30 seconds`);
      }

      return port;
    } catch (error) {
      console.error(`Failed to start OpenChamber for ${user.username}:`, error);
      throw new Error(`Failed to start OpenChamber instance: ${(error as Error).message}`);
    }
  }

  private cleanupInstance(username: string): void {
    const instance = this.instances.get(username);
    if (instance) {
      this.portToUser.delete(instance.port);
      this.instances.delete(username);
      this.savePortMappings();
    }
  }

  stopInstance(username: string): void {
    const pidFile = `/tmp/${username}_OC.pid`;
    
    try {
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        console.log(`Stopping OpenChamber instance for ${username} with PID ${pid}`);
        
        if (pid > 0) {
          try {
            process.kill(pid, 0);
            console.log(`Process ${pid} exists, sending SIGTERM`);
            process.kill(pid, 'SIGTERM');
          } catch (err) {
            console.log(`Process ${pid} does not exist or cannot be killed with SIGTERM: ${(err as Error).message}`);
          }
          
          setTimeout(() => {
            try {
              process.kill(pid, 0);
              console.log(`Process ${pid} still running, sending SIGKILL`);
              process.kill(pid, 'SIGKILL');
            } catch {
              console.log(`Process ${pid} has terminated`);
            }
          }, 5000);
        }
        fs.unlinkSync(pidFile);
      } else {
        console.log(`No PID file found for ${username}, nothing to stop`);
      }
    } catch (error) {
      console.error(`Error stopping OpenChamber for ${username}:`, error);
    }
    
    this.cleanupInstance(username);
  }

  private getPidFromPidFile(username: string): number {
    const pidFile = `/tmp/${username}_OC.pid`;
    
    try {
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        return pid;
      }
    } catch (error) {
      console.error(`Error reading PID file for ${username}:`, error);
    }
    
    return 0;
  }

  getInstance(username: string): OpenChamberInstance | null {
    return this.instances.get(username) || null;
  }

  getAllInstances(): OpenChamberInstance[] {
    return Array.from(this.instances.values());
  }

  shutdownAll(): void {
    console.log('Shutting down all OpenChamber instances');
    
    for (const [username, instance] of this.instances) {
      try {
        const pidFile = `/tmp/${username}_OC.pid`;
        if (fs.existsSync(pidFile)) {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
          if (pid > 0) {
            try {
              process.kill(pid, 0);
              console.log(`Killing OpenChamber process ${pid} for ${username} with SIGKILL`);
              process.kill(pid, 'SIGKILL');
            } catch {
              console.log(`Process ${pid} already terminated`);
            }
          }
          fs.unlinkSync(pidFile);
        }
      } catch (error) {
        console.error(`Error shutting down OpenChamber for ${username}:`, error);
      }
    }
    
    this.instances.clear();
    this.portToUser.clear();
    this.savePortMappings();
  }

  private startHealthCheck(): void {
    setTimeout(async () => {
      for (const [username, instance] of this.instances) {
        const isHealthy = await this.isInstanceHealthy(instance);
        if (!isHealthy) {
          console.log(`Instance for ${username} is unhealthy (status: ${instance.status}), cleaning up`);
          this.cleanupInstance(username);
        }
      }
    }, 5000);

    setInterval(async () => {
      for (const [username, instance] of this.instances) {
        const isHealthy = await this.isInstanceHealthy(instance);
        if (!isHealthy) {
          console.log(`Instance for ${username} is unhealthy (status: ${instance.status}), cleaning up`);
          this.cleanupInstance(username);
        }
      }
    }, 30000);
  }
}