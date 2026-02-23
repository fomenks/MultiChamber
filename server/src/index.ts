import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import proxyRoutes, { apiTerminalRouter, handleWebSocketUpgrade } from './routes/proxy.js';
import { OpenChamberService } from './services/openChamberService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, please try again later' },
});

const app = express();

const isProduction = NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: false,
  originAgentCluster: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: false,
  xFrameOptions: false,
  xContentTypeOptions: false,
}));

app.use(cors({
  origin: isProduction ? false : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/mc13/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/mc13/api/auth/login', authLimiter);
app.use('/mc13/api/auth', authRoutes);

app.use('/mc13/api/admin', authMiddleware, adminRoutes);

// API Terminal proxy - forwards to OpenChamber instance
app.use('/mc13/api/terminal', authMiddleware, apiTerminalRouter);

app.use('/mc13', express.static(path.join(__dirname, '../../ui/dist')));

app.use('/mc13/chamber', proxyRoutes);

app.use(authMiddleware);

app.get('/mc13', (req, res) => {
  res.sendFile(path.join(__dirname, '../../ui/dist/index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../ui/dist/index.html'));
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: isProduction ? 'Internal server error' : err.message 
  });
});

const openChamberService = new OpenChamberService();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MultiChamber server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

// Handle WebSocket upgrades for chamber proxy
server.on('upgrade', async (request, socket, head) => {
  console.log(`[DEBUG SERVER] Upgrade event received for: ${request.url}`);
  const handled = await handleWebSocketUpgrade(request, socket, head, server);
  if (!handled) {
    console.log(`[DEBUG SERVER] WebSocket not handled by chamber proxy`);
    socket.destroy();
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    openChamberService.shutdownAll();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    openChamberService.shutdownAll();
    process.exit(0);
  });
});