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
import proxyRoutes from './routes/proxy.js';

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

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/admin', authMiddleware, adminRoutes);

app.use(express.static(path.join(__dirname, '../../ui/dist')));

app.use('/chamber', proxyRoutes);

app.use(authMiddleware);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../ui/dist/index.html'));
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: isProduction ? 'Internal server error' : err.message 
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MultiChamber server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});