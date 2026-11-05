import type { PrismaClient } from "@lifeos/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError } from "../shared/http.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "user" | "support" | "admin";
  aal: string;
  issuedAt: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface VerifiedToken {
  sub: string;
  email: string;
  aal: string;
  issuedAt: number;
}
export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

interface VerifierOptions {
  keys: JWTVerifyGetKey;
  issuer: string;
  audience: string;
}

/** Checks signature, issuer, audience and expiry. Asymmetric algorithms only, so `none` and HS256 fail. */
export function createTokenVerifier({ keys, issuer, audience }: VerifierOptions): TokenVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["ES256", "RS256"],
      requiredClaims: ["sub", "exp", "iss", "aud"],
    });
    if (payload.role !== "authenticated" || typeof payload.sub !== "string") {
      throw new Error("Token is not a user session");
    }
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      aal: typeof payload.aal === "string" ? payload.aal : "aal1",
      issuedAt: payload.iat ?? 0,
    };
  };
}

export function remoteKeys(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
}

/** Concurrent first requests can race to insert. The loser re-reads the winner's row. */
async function findOrCreateProfile(prisma: PrismaClient, token: VerifiedToken) {
  const where = { authUserId: token.sub };
  const existing = await prisma.profile.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.profile.create({
      data: { authUserId: token.sub, email: token.email, preferences: { create: {} } },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    return prisma.profile.findUniqueOrThrow({ where });
  }
}

const unauthenticated = () => new AppError(401, "unauthenticated", "Authentication required");

/** Identity comes only from the verified token, never from a client-supplied user id. */
export function requireAuth(prisma: PrismaClient, verify: TokenVerifier): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthenticated();
    let token: VerifiedToken;
    try {
      token = await verify(header.slice(7));
    } catch {
      throw unauthenticated();
    }
    const profile = await findOrCreateProfile(prisma, token);
    if (profile.accessRevokedAt || profile.deletedAt) {
      throw new AppError(403, "access_revoked", "Access to this account has been revoked");
    }
    req.user = { id: profile.authUserId, email: profile.email, role: profile.role, aal: token.aal, issuedAt: token.issuedAt };
    next();
  };
}

const REAUTH_WINDOW_SECONDS = 300;

/** Sensitive actions need a token minted moments ago, which means the user just re-entered credentials. */
export const requireRecentAuth: RequestHandler = (req, _res, next) => {
  const age = Date.now() / 1000 - (req.user?.issuedAt ?? 0);
  if (age > REAUTH_WINDOW_SECONDS) {
    throw new AppError(403, "reauthentication_required", "Please sign in again to continue");
  }
  next();
};

export function requireRole(roles: AuthenticatedUser["role"][], requireMfa: boolean): RequestHandler {
  return (req, _res, next) => {
    // Same response as an unknown route, so the admin surface is not discoverable.
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(404, "not_found", "Not found");
    if (requireMfa && req.user.aal !== "aal2") {
      throw new AppError(403, "mfa_required", "Multi-factor authentication is required");
    }
    next();
  };
}
