import type { NextApiRequest } from "next";
import jwt from "jsonwebtoken";

export type SignedInfo = {
  stackApiKey: string;
  appUid: string;
  installationUid: string;
  userUid: string;
};

function getAppToken(req: NextApiRequest): string | null {
  const hdr =
    req.headers["x-app-token"] || req.headers["x-contentstack-app-token"];
  const q = req.query["app-token"];
  if (typeof hdr === "string") return hdr;
  if (Array.isArray(hdr) && hdr[0]) return hdr[0];
  if (typeof q === "string") return q;
  if (Array.isArray(q) && q[0]) return q[0];
  return null;
}

// Cache signing keys per base URL with a short TTL to avoid frequent fetches
const pemCache = new Map<string, { pem: string; ts: number }>();
const ONE_HOUR_MS = 60 * 60 * 1000;

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(pad, "base64").toString("utf8");
}

function inferBaseFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const iss = payload?.iss;
    if (typeof iss === "string" && /contentstack\.com/.test(iss)) {
      return iss;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchSigningKeyPEM(baseUrl: string): Promise<string> {
  const now = Date.now();
  const cached = pemCache.get(baseUrl);
  if (cached && now - cached.ts < ONE_HOUR_MS) return cached.pem;

  const res = await fetch(new URL("/.well-known/public-keys.json", baseUrl));
  if (!res.ok) throw new Error(`Failed to fetch signing key: ${res.status}`);
  const json = (await res.json()) as { "signing-key"?: string };

  const pem = json["signing-key"];
  if (!pem || !pem.includes("BEGIN") || !pem.includes("PUBLIC KEY")) {
    throw new Error("Signing key PEM missing or malformed");
  }

  pemCache.set(baseUrl, { pem, ts: now });
  return pem;
}

export async function verifySignedLocation(
  req: NextApiRequest
): Promise<SignedInfo> {
  const token = getAppToken(req);
  if (!token) throw new Error("Missing signed location token");

  // Prefer issuer from token; fall back to env or default NA region
  const inferred = inferBaseFromToken(token);
  const base =
    inferred ||
    process.env.CONTENTSTACK_BASE_URL ||
    "https://app.contentstack.com";

  const pem = await fetchSigningKeyPEM(base);

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, pem, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;
  } catch (e) {
    const errObj = e as unknown as { name?: string; message?: string };
    const name = errObj?.name ?? "";
    const message = errObj?.message ?? "";
    if (name === "TokenExpiredError" || /expired/i.test(message)) {
      const err = new Error("TOKEN_EXPIRED") as Error & { code?: string };
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    if (name === "JsonWebTokenError" || name === "NotBeforeError") {
      const err = new Error("INVALID_APP_TOKEN") as Error & {
        code?: string;
      };
      err.code = "INVALID_APP_TOKEN";
      throw err;
    }
    throw new Error("INVALID_APP_TOKEN");
  }

  const stackApiKey = payload["stack_api_key"];
  const appUid = payload["app_uid"];
  const installationUid = payload["installation_uid"];
  const userUid = payload["user_uid"];

  if (
    typeof stackApiKey !== "string" ||
    typeof appUid !== "string" ||
    typeof installationUid !== "string"
  ) {
    throw new Error("Invalid signed token payload");
  }

  return {
    stackApiKey,
    appUid,
    installationUid,
    userUid: typeof userUid === "string" ? userUid : "",
  };
}
