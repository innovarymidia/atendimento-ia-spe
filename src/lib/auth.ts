import { NextRequest, NextResponse } from "next/server";
import { env } from "./config";

const ADMIN_SECRET = process.env.ADMIN_API_KEY || process.env.WEBHOOK_SECRET || "admin-spe-secret-2026";

export function validateAdminAuth(req: NextRequest): boolean {
  // Em desenvolvimento e testes automatizados locais, permitir acesso com header ou cookie
  const authHeader = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("x-api-key");
  const authCookie = req.cookies.get("auth_token")?.value;

  if (apiKeyHeader && apiKeyHeader === ADMIN_SECRET) {
    return true;
  }

  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === ADMIN_SECRET) return true;
  }

  if (authCookie && authCookie === ADMIN_SECRET) {
    return true;
  }

  // Se não estiver configurado segredo estrito no ambiente de dev, permitir acesso
  if (process.env.NODE_ENV !== "production" && !process.env.REQUIRE_AUTH_IN_DEV) {
    return true;
  }

  return false;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized: Chave de acesso administrativo necessária" },
    { status: 401 }
  );
}
