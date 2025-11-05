import type { NextApiRequest } from "next";
import jwt from "jsonwebtoken";

export type SignedInfo = {
  stackApiKey: string;
  appUid: string;
  installationUid: string;
  userUid: string;
};

function getAppToken(req: NextApiRequest): string | null {
  // Accept tokens only via headers to avoid leakage via URLs/logs
  const hdr =
    req.headers["x-app-token"] || req.headers["x-contentstack-app-token"];
  if (typeof hdr === "string") return hdr;
  if (Array.isArray(hdr) && hdr[0]) return hdr[0];
  return null;
}

let cachedPem: { pem: string; fetchedAt: number } | null = null;
const PEM_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchSigningKeyPEM(): Promise<string> {
  if (cachedPem && Date.now() - cachedPem.fetchedAt < PEM_TTL_MS) {
    return cachedPem.pem;
  }

  const base = process.env.CONTENTSTACK_BASE_URL;
  if (!base) {
    throw new Error(
      "Set CONTENTSTACK_BASE_URL to your region host, for example https://eu-app.contentstack.com"
    );
  }

  const res = await fetch(new URL("/.well-known/public-keys.json", base));
  if (!res.ok) throw new Error(`Failed to fetch signing key: ${res.status}`);
  const json = (await res.json()) as { "signing-key"?: string };

  const pem = json["signing-key"];
  if (!pem || !pem.includes("BEGIN") || !pem.includes("PUBLIC KEY")) {
    throw new Error("Signing key PEM missing or malformed");
  }

  cachedPem = { pem, fetchedAt: Date.now() };
  return pem;
}

export async function verifySignedLocation(
  req: NextApiRequest
): Promise<SignedInfo> {
  const token = getAppToken(req);
  if (!token) throw new Error("Missing signed location token");

  const pem = await fetchSigningKeyPEM();

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, pem, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;
  } catch (e: unknown) {
    // Normalize errors so the client can react appropriately
    if ((e as { name?: string })?.name === "TokenExpiredError") {
      throw new Error("TOKEN_EXPIRED");
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
