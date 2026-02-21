import { useEffect, useState } from 'react'
import { useAdminStore, useUserManagementStore } from '@/stores/adminStore'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Users, 
  Cpu, 
  MemoryStick, 
  Clock, 
  Play, 
  Square, 
  RefreshCw,
  Trash2,
  Plus,
  Shield,
  Check
} from 'lucide-react'
import { formatBytes, formatUptime } from '@/lib/utils'

export function AdminPage() {
  const { user } = useAuthStore()
  const { status, isLoading: statusLoading, fetchStatus, restartInstance, stopInstance } = useAdminStore()
  const { users, isLoading: usersLoading, fetchUsers, createUser, deleteUser } = useUserManagementStore()
  
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    fetchStatus()
    fetchUsers()
    
    // Refresh status every 30 seconds
    const interval = setInterval(() => {
      fetchStatus()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [fetchStatus, fetchUsers])

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) return
    
    try {
      await createUser(newUsername, newPassword, isAdmin)
      setNewUsername('')
      setNewPassword('')
      setIsAdmin(false)
      setCreateDialogOpen(false)
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  const handleDeleteUser = async (username: string) => {
    if (confirm(`Are you sure you want to delete user ${username}?`)) {
      try {
        await deleteUser(username)
      } catch (error) {
        console.error('Failed to delete user:', error)
      }
    }
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage users and monitor system status
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => { fetchStatus(); fetchUsers(); }}
          disabled={statusLoading || usersLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${(statusLoading || usersLoading) ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* System Stats */}
      {status && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatUptime(status.system.uptime)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.system.memory.percentage}%</div>
              <p className="text-xs text-muted-foreground">
                {formatBytes(status.system.memory.used)} / {formatBytes(status.system.memory.total)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.users.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Instances</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.openChamber.activeInstances}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage system users and their OpenChamber instances
            </CardDescription>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user to the system. They will get their own home directory and OpenChamber instance.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    placeholder="Enter username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isAdmin"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="isAdmin" className="text-sm font-medium">
                    Administrator privileges
                  </label>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateUser} disabled={!newUsername || !newPassword}>
                  Create User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Home Directory</TableHead>
                <TableHead>Instance Status</TableHead>
                <TableHead>Port</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const instance = status?.openChamber.instances.find(
                  i => i.username === user.username
                )
                
                return (
                  <TableRow key={user.username}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      {user.isAdmin ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">User</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {user.homeDir}
                    </TableCell>
                    <TableCell>
                      {instance ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <Check className="h-3 w-3" />
                          {instance.status}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Stopped</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {instance?.port || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {instance ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => stopInstance(user.username)}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restartInstance(user.username)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {user.username !== 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.username)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
