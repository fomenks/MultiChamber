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

  private async isInstanceHealthy(instance: OpenChamberInstance): Promise<boolean> {
    if (instance.status === 'starting') {
      return false;
    }

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

  private async startInstanceUsingScript(user: User): Promise<number> {
    try {
      const output = execSync(`/usr/local/bin/runOC.sh ${user.username}`, { encoding: 'utf-8' });
      const port = parseInt(output.trim(), 10);
      
      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        throw new Error(`Invalid port returned: ${port}`);
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
        if (pid > 0) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
            }
          }
        }
        fs.unlinkSync(pidFile);
      }
    } catch (error) {
      console.error(`Error stopping OpenChamber for ${username}:`, error);
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