import type { PrismaClient } from "@lifeos/db";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError } from "../shared/http.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "user" | "support" | "admin";
  aal: string;
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
    req.user = { id: profile.authUserId, email: profile.email, role: profile.role, aal: token.aal };
    next();
  };
}
