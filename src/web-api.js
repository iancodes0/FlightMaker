const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const API_PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1568375825445822654";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = "https://turkishairwaysptfs.github.io/";
const ALLOWED_ORIGINS = new Set([
  "https://turkishairwaysptfs.github.io",
  "https://iancodes0.github.io",
]);
const STAFF_IDS = new Set([
  "1420191498988814377",
  "1388554248144293919",
  "1537414223213109288",
]);
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATA_FILE = path.join(__dirname, "..", "data", "website.json");

const readData = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { flights: [], bookings: [] };
    throw error;
  }
};

const writeData = (data) => {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
};

const send = (response, status, body, origin) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin || "https://turkishairwaysptfs.github.io",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
};

const parseBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (Buffer.concat(chunks).length > 32 * 1024) throw new Error("Request body is too large.");
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (value) => crypto.createHmac("sha256", SESSION_SECRET || "missing-secret").update(value).digest("base64url");

const createSession = (user) => {
  const payload = encode({ id: user.id, username: user.username, exp: Date.now() + 8 * 60 * 60 * 1000 });
  return `${payload}.${sign(payload)}`;
};

const getSession = (request) => {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET is not configured.");
  const token = request.headers["x-session-token"];
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  const expectedSignature = sign(payload || "");
  if (
    !payload ||
    !signature ||
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) return null;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return session.exp > Date.now() ? session : null;
};

const requireStaff = (request) => {
  const session = getSession(request);
  return session && STAFF_IDS.has(session.id) ? session : null;
};

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.message || "Discord request failed.");
  return body;
};

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(response, 403, { error: "Origin not allowed." }, origin);
  if (request.method === "OPTIONS") return send(response, 204, {}, origin);
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { ok: true }, origin);
    if (request.method === "GET" && url.pathname === "/api/flights") {
      return send(response, 200, { flights: readData().flights }, origin);
    }
    if (request.method === "POST" && url.pathname === "/api/auth/exchange") {
      if (!CLIENT_SECRET) return send(response, 503, { error: "Discord OAuth is not configured on the server." }, origin);
      const { code } = await parseBody(request);
      if (!code) return send(response, 400, { error: "Authorization code is required." }, origin);
      const token = await requestJson("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const user = await requestJson("https://discord.com/api/users/@me", {
        headers: { Authorization: `${token.token_type} ${token.access_token}` },
      });
      return send(response, 200, {
        token: createSession(user),
        user: { id: user.id, username: user.global_name || user.username, isStaff: STAFF_IDS.has(user.id) },
      }, origin);
    }
    if (request.method === "POST" && url.pathname === "/api/bookings") {
      const session = getSession(request);
      if (!session) return send(response, 401, { error: "Sign in with Discord before booking." }, origin);
      const body = await parseBody(request);
      if (!body.flightId || !body.passengerName || !body.email) {
        return send(response, 400, { error: "Flight, passenger name, and email are required." }, origin);
      }
      const data = readData();
      const flight = data.flights.find((item) => item.id === body.flightId);
      if (!flight) return send(response, 404, { error: "That flight is no longer available." }, origin);
      data.bookings.push({
        id: crypto.randomUUID(),
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        passengerName: String(body.passengerName).slice(0, 100),
        email: String(body.email).slice(0, 200),
        discordId: session.id,
        createdAt: new Date().toISOString(),
      });
      writeData(data);
      return send(response, 201, { message: "Your booking request has been received." }, origin);
    }
    if (request.method === "POST" && url.pathname === "/api/flights") {
      const session = requireStaff(request);
      if (!session) return send(response, 403, { error: "Staff access is required." }, origin);
      const body = await parseBody(request);
      if (!body.flightNumber || !body.origin || !body.destination || !body.departure || !body.aircraft) {
        return send(response, 400, { error: "Flight number, route, departure, and aircraft are required." }, origin);
      }
      const data = readData();
      const flight = {
        id: crypto.randomUUID(),
        flightNumber: String(body.flightNumber).slice(0, 20),
        origin: String(body.origin).slice(0, 8).toUpperCase(),
        destination: String(body.destination).slice(0, 8).toUpperCase(),
        departure: String(body.departure).slice(0, 40),
        aircraft: String(body.aircraft).slice(0, 60),
        createdBy: session.id,
        createdAt: new Date().toISOString(),
      };
      data.flights.push(flight);
      writeData(data);
      return send(response, 201, { flight }, origin);
    }
    return send(response, 404, { error: "Not found." }, origin);
  } catch (error) {
    console.error("Website API request failed:", error);
    return send(response, 500, { error: error instanceof Error ? error.message : "Internal server error." }, origin);
  }
});

server.listen(API_PORT, () => console.log(`Website API listening on port ${API_PORT}`));
