// Veri-Gate API — CR-V17-AWS-CONNECT-001
//
// One Lambda behind an API Gateway HTTP API. GET /health is public, so anyone can see the service
// and its database are up. Everything under /v1 needs a Cognito sign-in; API Gateway checks the
// token before this code runs, and the handler checks again that it did.

import { createDb, isDatabaseWaking } from "./db.mjs";
import { movementPage, referenceData, RequestError } from "./queries.mjs";
import { recordMovement } from "./writes.mjs";
import { groupsFrom, recordChange } from "./changes.mjs";

export function createHandler({ db, stage = "dev", now = () => new Date() }) {
  return async function handle(event = {}) {
    const method = event.requestContext?.http?.method || "GET";
    const path = event.rawPath || "/";
    try {
      if (method === "GET" && path === "/health") return json(200, await health(db, stage, now));

      if (path.startsWith("/v1/")) {
        const claims = event.requestContext?.authorizer?.jwt?.claims;
        if (!claims || !claims.sub) return json(401, { error: "unauthorized", message: "Sign in first." });
        if (method === "GET" && path === "/v1/reference") return json(200, await referenceData(db));
        if (method === "GET" && path === "/v1/movements") return json(200, await movementPage(db, event.queryStringParameters || {}));
        const actor = String(claims["cognito:username"] || claims.sub || "");
        if (method === "POST" && path === "/v1/movements") {
          const result = await recordMovement(db, readBody(event), { actor, now });
          // A movement already recorded answers 200, not 201: a handheld retrying after a dropped
          // signal must be able to tell "stored once" from "stored twice", and neither is an error.
          return json(result.duplicate ? 200 : 201, result);
        }
        // A change to a driver, vehicle, authorization or override switch. Same rule: 200 for one
        // already recorded.
        if (method === "POST" && path === "/v1/changes") {
          const result = await recordChange(db, readBody(event), { actor, groups: groupsFrom(claims), now });
          return json(result.duplicate ? 200 : 201, result);
        }
      }

      return json(404, { error: "not_found", message: `There is no ${method} ${path}.` });
    } catch (error) {
      if (isDatabaseWaking(error)) {
        return json(503, { error: "database_waking", message: "The database is waking up. Try again in about 20 seconds." }, { "retry-after": "20" });
      }
      if (error instanceof RequestError) return json(error.status, { error: error.code, message: error.message });
      console.error(JSON.stringify({ level: "error", method, path, name: error.name, message: error.message }));
      return json(500, { error: "internal", message: "The server could not complete this request. It has been logged." });
    }
  };
}

async function health(db, stage, now) {
  const rows = await db.query("select version from schema_migrations order by version");
  return { service: "veri-gate-api", stage, database: "up", migrations: rows.map((row) => row.version), checkedAt: now().toISOString() };
}

// API Gateway hands the body through as text, base64 when it says so.
function readBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    throw new RequestError("The request body is not JSON this API can read.");
  }
}

function json(statusCode, body, headers = {}) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers }, body: JSON.stringify(body) };
}

export const handler = createHandler({ db: createDb(process.env), stage: process.env.STAGE });
