export interface User {
  username: string
  isAdmin: boolean
  homeDir: string
  uid?: number
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  openChamberPort: number | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export interface UserState {
  users: User[]
  isLoading: boolean
  fetchUsers: () => Promise<void>
  createUser: (username: string, password: string, isAdmin?: boolean) => Promise<void>
  deleteUser: (username: string) => Promise<void>
}

export interface SystemStatus {
  system: {
    uptime: number
    memory: {
      total: number
      free: number
      used: number
      percentage: number
    }
    cpu: {
      count: number
      loadAvg: number[]
    }
    platform: string
    release: string
  }
  users: {
    total: number
    list: User[]
  }
  openChamber: {
    activeInstances: number
    instances: Array<{
      username: string
      port: number
      pid: number
      startTime: string
      status: string
    }>
  }
}

export interface AdminState {
  status: SystemStatus | null
  isLoading: boolean
  fetchStatus: () => Promise<void>
  restartInstance: (username: string) => Promise<void>
  stopInstance: (username: string) => Promise<void>
}
