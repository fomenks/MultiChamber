import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, User, Folder, Cpu } from 'lucide-react'

export function DashboardPage() {
  const { user, openChamberPort } = useAuthStore()
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  const openChamberUrl = `/`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.username}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Username</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user?.username}</div>
            <p className="text-xs text-muted-foreground">
              {user?.isAdmin ? 'Administrator' : 'Regular User'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Home Directory</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{user?.homeDir}</div>
            <p className="text-xs text-muted-foreground">
              Your workspace location
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OpenChamber Port</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openChamberPort || 'Loading...'}</div>
            <p className="text-xs text-muted-foreground">
              Instance running on port {openChamberPort}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="h-[calc(100vh-300px)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>OpenChamber Workspace</CardTitle>
            <CardDescription>
              Your personal OpenChamber instance
            </CardDescription>
          </div>
          <a 
            href={openChamberUrl} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open in New Tab
            </Button>
          </a>
        </CardHeader>
        <CardContent className="h-[calc(100%-80px)]">
          {!iframeLoaded && !iframeError && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          
          {iframeError && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <p className="text-muted-foreground">
                Unable to load OpenChamber in iframe.
              </p>
              <a 
                href={openChamberUrl} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button>Open OpenChamber</Button>
              </a>
            </div>
          )}

          <iframe
            src={openChamberUrl}
            className={`w-full h-full border-0 rounded-md ${iframeLoaded ? 'block' : 'hidden'}`}
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </CardContent>
      </Card>
    </div>
  )
}
