import jwt from 'jsonwebtoken';
import type { User } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'multichamber-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

export interface JWTPayload {
  username: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

export class JWTService {
  static generateToken(user: User): string {
    return jwt.sign(
      {
        username: user.username,
        isAdmin: user.isAdmin,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }

  static decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }
}
