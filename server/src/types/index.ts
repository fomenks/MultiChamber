export interface User {
  username: string;
  uid: number;
  gid: number;
  homeDir: string;
  shell: string;
  isAdmin: boolean;
}

export interface UserSession {
  username: string;
  token: string;
  openChamberPort?: number;
  openChamberPid?: number;
  connectedAt: Date;
  lastActivity: Date;
}

export interface OpenChamberInstance {
  port: number;
  pid: number;
  username: string;
  startTime: Date;
  status: 'starting' | 'running' | 'error';
}

export interface CreateUserRequest {
  username: string;
  password: string;
  isAdmin?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    username: string;
    isAdmin: boolean;
    homeDir: string;
  };
  openChamberPort: number;
}

export interface SystemStatus {
  users: User[];
  activeSessions: UserSession[];
  openChamberInstances: OpenChamberInstance[];
  systemUptime: number;
}
