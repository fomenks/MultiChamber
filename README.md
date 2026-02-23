# MultiChamber

Multi-user OpenChamber system based on Ubuntu 24.04 LTS with Docker containerization.

## Features

- **Multi-user support**: Each user gets their own Unix account with home directory
- **Per-user OpenChamber instances**: Each user has their own isolated OpenChamber instance
- **HTTP-based authentication**: Web interface for login with JWT tokens
- **Automatic port management**: Dynamic port allocation for OpenChamber instances
- **Admin panel**: User management, system monitoring, instance control
- **Proxy routing**: Automatic traffic routing to user's OpenChamber instance
- **Standard Unix authentication**: Uses /etc/passwd and /etc/shadow

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           MultiChamber HTTP Server (Port 8080)      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │  Login   │  │  Admin   │  │  Proxy Service   │  │   │
│  │  │  Page    │  │  Panel   │  │                  │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│          ┌───────────────┼───────────────┐                 │
│          ▼               ▼               ▼                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ OpenChamber  │ │ OpenChamber  │ │ OpenChamber  │       │
│  │   User 1     │ │   User 2     │ │   User N     │       │
│  │ (Port 10001) │ │ (Port 10002) │ │ (Port 1000N) │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Unix User System (/etc/passwd)         │    │
│  │  - admin (administrator)                         │    │
│  │  - user1, user2, ... (regular users)             │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Using Docker Compose

1. Clone or copy the MultiChamber directory
2. Set the admin password:
   ```bash
   export MC_ADMIN_PASSWD="your-secure-password"
   ```
3. Build and run:
   ```bash
   docker-compose up -d
   ```
4. Access the web interface at `http://localhost:8080`
5. Login with:
   - Username: `admin`
   - Password: The value you set in `MC_ADMIN_PASSWD`

### Building Manually

```bash
# Build the Docker image
docker build -t multichamber:latest .

# Run the container
docker run -d \
  -p 8080:8080 \
  -p 10000-20000:10000-20000 \
  -e MC_ADMIN_PASSWD="your-secure-password" \
  -v multichamber_users:/home/users \
  --privileged \
  --name multichamber \
  multichamber:latest
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MC_ADMIN_PASSWD` | Admin user password | `admin123` |
| `JWT_SECRET` | Secret key for JWT tokens | `multichamber-secret-change-me` |
| `PORT` | Main HTTP server port | `8080` |
| `NODE_ENV` | Environment mode | `production` |

### Port Range

OpenChamber instances use ports 10000-20000. Make sure this range is available and exposed in your Docker configuration.

## Development

### Prerequisites

- Node.js 20+
- Bun (optional, for OpenChamber)
- Docker and Docker Compose

### Setup

```bash
# Install dependencies
npm install
cd server && npm install
cd ../ui && npm install

# Run in development mode
npm run dev
```

### Project Structure

```
MultiChamber/
├── Dockerfile                 # Docker image definition
├── docker-compose.yml         # Docker Compose configuration
├── package.json               # Root package configuration
├── scripts/
│   ├── init-system.sh        # Container initialization
│   └── start-openchamber.sh  # OpenChamber startup script
├── server/                    # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── index.ts          # Main server entry
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Express middleware
│   │   └── types/            # TypeScript types
│   └── package.json
└── ui/                        # Frontend (React + TypeScript + Tailwind)
    ├── src/
    │   ├── main.tsx          # React entry
    │   ├── App.tsx           # Main app component
    │   ├── pages/            # Page components
    │   ├── components/       # UI components
    │   └── stores/           # Zustand stores
    └── package.json
```

## API Endpoints

### Authentication
- `POST /mc13/api/auth/login` - User login
- `POST /mc13/api/auth/logout` - User logout
- `GET /mc13/api/auth/me` - Get current user info
- `POST /mc13/api/auth/change-password` - Change password

### User Management (Admin only)
- `GET /mc13/api/auth/users` - List all users
- `POST /mc13/api/auth/users` - Create new user
- `DELETE /mc13/api/auth/users/:username` - Delete user

### Admin
- `GET /mc13/api/admin/status` - System status
- `POST /mc13/api/admin/restart-instance/:username` - Restart user's OpenChamber
- `POST /mc13/api/admin/stop-instance/:username` - Stop user's OpenChamber

### Proxy
- `GET /*` - Proxy to user's OpenChamber instance

## Security Considerations

1. **Change default passwords**: Always set `MC_ADMIN_PASSWD` and `JWT_SECRET` in production
2. **Use HTTPS**: Deploy behind a reverse proxy with SSL termination
3. **Firewall**: Restrict access to port range 10000-20000 if not needed externally
4. **Privileged mode**: The container runs in privileged mode for proper user management
5. **Regular updates**: Keep the base image and dependencies updated

## License
GNU AGPL
