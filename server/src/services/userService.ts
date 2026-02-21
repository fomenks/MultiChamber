import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { User, CreateUserRequest } from '../types/index.js';

const USERS_BASE_DIR = '/home/users';
const SALT_ROUNDS = 10;

export class UserService {
  private usersCache: Map<string, User> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor() {
    this.ensureBaseDirectory();
  }

  private ensureBaseDirectory(): void {
    if (!fs.existsSync(USERS_BASE_DIR)) {
      fs.mkdirSync(USERS_BASE_DIR, { recursive: true });
    }
  }

  private parsePasswdLine(line: string): User | null {
    const parts = line.split(':');
    if (parts.length < 7) return null;

    const [username, , uid, gid, , homeDir, shell] = parts;
    
    // Only include users from our users directory
    if (!homeDir.startsWith(USERS_BASE_DIR) && username !== 'admin') {
      return null;
    }

    return {
      username,
      uid: parseInt(uid, 10),
      gid: parseInt(gid, 10),
      homeDir,
      shell,
      isAdmin: username === 'admin',
    };
  }

  private refreshCache(): void {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.CACHE_TTL) {
      return;
    }

    this.usersCache.clear();
    
    try {
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf-8');
      const lines = passwdContent.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const user = this.parsePasswdLine(line);
        if (user) {
          this.usersCache.set(user.username, user);
        }
      }
    } catch (error) {
      console.error('Error reading /etc/passwd:', error);
    }

    this.lastCacheUpdate = now;
  }

  getAllUsers(): User[] {
    this.refreshCache();
    return Array.from(this.usersCache.values());
  }

  getUser(username: string): User | null {
    this.refreshCache();
    return this.usersCache.get(username) || null;
  }

  validateCredentials(username: string, password: string): boolean {
    try {
      // Use Python's crypt module to verify password against /etc/shadow
      const pythonScript = `
import crypt
import sys
import spwd

try:
    entry = spwd.getspnam('${username}')
    hashed = entry.sp_pwdp
    
    # Check if account is locked
    if hashed in ('*', '!', '!!'):
        sys.exit(1)
    
    # Verify password
    result = crypt.crypt('${password}', hashed)
    if result == hashed:
        sys.exit(0)
    else:
        sys.exit(1)
except KeyError:
    sys.exit(1)
except Exception as e:
    sys.exit(1)
`;
      
      try {
        execSync(`python3 -c "${pythonScript}"`, { 
          encoding: 'utf-8', 
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000 
        });
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  createUser(request: CreateUserRequest): User {
    const { username, password, isAdmin = false } = request;

    // Validate username
    if (!/^[a-z_][a-z0-9_-]*$/.test(username)) {
      throw new Error('Invalid username format');
    }

    // Check if user exists
    if (this.getUser(username)) {
      throw new Error('User already exists');
    }

    const homeDir = path.join(USERS_BASE_DIR, username);

    try {
      // Create user with useradd
      const useraddCmd = [
        'useradd',
        '-m',
        '-d', homeDir,
        '-s', '/bin/bash',
        '-b', USERS_BASE_DIR,
        username,
      ];

      if (isAdmin) {
        useraddCmd.push('-G', 'sudo');
      }

      execSync(useraddCmd.join(' '), { stdio: 'inherit' });

      // Set password
      const chpasswdCmd = `echo '${username}:${password}' | chpasswd`;
      execSync(chpasswdCmd, { stdio: 'pipe' });

      // Setup OpenChamber in user's home
      this.setupUserOpenChamber(username, homeDir);

      // Clear cache to include new user
      this.lastCacheUpdate = 0;

      return this.getUser(username)!;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  private setupUserOpenChamber(username: string, homeDir: string): void {
    const opencodeDir = path.join(homeDir, '.opencode');
    
    // Create necessary directories
    fs.mkdirSync(opencodeDir, { recursive: true });
    fs.mkdirSync(path.join(homeDir, 'workspace'), { recursive: true });

    // Set proper ownership
    try {
      const user = this.getUser(username);
      if (user) {
        execSync(`chown -R ${username}:${username} ${homeDir}`, { stdio: 'ignore' });
      }
    } catch (error) {
      console.error('Error setting ownership:', error);
    }
  }

  deleteUser(username: string): void {
    if (username === 'admin') {
      throw new Error('Cannot delete admin user');
    }

    const user = this.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      execSync(`userdel -r ${username}`, { stdio: 'inherit' });
      this.lastCacheUpdate = 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw new Error('Failed to delete user');
    }
  }

  changePassword(username: string, newPassword: string): void {
    const user = this.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      const chpasswdCmd = `echo '${username}:${newPassword}' | chpasswd`;
      execSync(chpasswdCmd, { stdio: 'pipe' });
    } catch (error) {
      console.error('Error changing password:', error);
      throw new Error('Failed to change password');
    }
  }
}
