import { createServer } from "node:http";

const port = 18080;
const webOrigin = "http://127.0.0.1:4173";

const kanji = [
  { id: "10000000-0000-4000-8000-000000000001", character: "木", familiarity: 5, meanings: ["tree", "wood"] },
  { id: "10000000-0000-4000-8000-000000000002", character: "学", familiarity: 4, meanings: ["study", "learning"] },
  { id: "10000000-0000-4000-8000-000000000003", character: "読", familiarity: 3, meanings: ["read"] },
  { id: "10000000-0000-4000-8000-000000000004", character: "話", familiarity: 2, meanings: ["speak", "story"] },
  { id: "10000000-0000-4000-8000-000000000005", character: "駅", familiarity: 1, meanings: ["station"] },
  { id: "10000000-0000-4000-8000-000000000006", character: "道", familiarity: 0, meanings: ["road", "way"] },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Origin": webOrigin,
    "Content-Type": "application/json",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, corsHeaders());
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const detectedKanji = [{
  kanjiMasterId: "10000000-0000-4000-8000-000000000005",
  character: "駅",
  recommended: true,
  whyUseful: "Useful on a daily commute",
  onyomi: ["エキ"],
  kunyomi: [],
  meanings: ["station"],
  frequency: 724,
  exampleWords: [{ word: "駅前", reading: "えきまえ", meaning: "in front of the station" }],
}];

let captureDeliveryOnline = false;
let scanStatus = "processing";
let analyzeCalls = 0;
const sessionsByCapture = new Map();

function resetCaptureState() {
  captureDeliveryOnline = false;
  scanStatus = "processing";
  analyzeCalls = 0;
  sessionsByCapture.clear();
}

function recentSessions() {
  if (sessionsByCapture.size === 0) return [];
  return [{
    sessionId: "session-1",
    storagePath: null,
    status: scanStatus,
    createdAt: "2026-08-05T00:00:00.000Z",
    kanjiCount: scanStatus === "done" ? detectedKanji.length : null,
    failureCode: scanStatus === "failed" ? "invalid_response" : null,
  }];
}

createServer(async (request, response) => {
  const path = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (path === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (path === "/__test/reset" && request.method === "POST") {
    resetCaptureState();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (path === "/__test/capture-state" && request.method === "POST") {
    const state = await readJson(request);
    if (typeof state.online === "boolean") captureDeliveryOnline = state.online;
    if (["processing", "done", "failed"].includes(state.status)) scanStatus = state.status;
    sendJson(response, 200, { online: captureDeliveryOnline, status: scanStatus });
    return;
  }

  if (path === "/__test/capture-metrics") {
    sendJson(response, 200, {
      analyzeCalls,
      sessionCount: new Set(sessionsByCapture.values()).size,
      clientCaptureIds: [...sessionsByCapture.keys()],
    });
    return;
  }

  if (path === "/api/user/summary") {
    sendJson(response, 200, {
      kanjiLearning: 4,
      kanjiFamiliar: 2,
      wordCount: 6,
      streak: 12,
      slotRemaining: 3,
      slotTotal: 5,
      slotEndsAt: "2099-08-04T18:00:00+09:00",
      onboardingComplete: true,
    });
    return;
  }

  if (path === "/api/photo/recent") {
    sendJson(response, 200, { sessions: recentSessions() });
    return;
  }

  if (path === "/api/photo/analyze" && request.method === "POST") {
    if (!captureDeliveryOnline) {
      sendJson(response, 503, { message: "Capture delivery is offline" });
      return;
    }
    const body = await readJson(request);
    analyzeCalls += 1;
    if (!sessionsByCapture.has(body.clientCaptureId)) {
      sessionsByCapture.set(body.clientCaptureId, "session-1");
    }
    sendJson(response, 200, {
      sessionId: sessionsByCapture.get(body.clientCaptureId),
      status: "processing",
    });
    return;
  }

  if (path === "/api/photo/session/session-1") {
    sendJson(response, 200, {
      sessionId: "session-1",
      status: scanStatus,
      storagePath: null,
      kanji: scanStatus === "done" ? detectedKanji : undefined,
      failureCode: scanStatus === "failed" ? "invalid_response" : null,
    });
    return;
  }

  if (path === "/api/kanji/list") {
    sendJson(response, 200, kanji);
    return;
  }

  sendJson(response, 404, { message: `No E2E fixture for ${request.method} ${path}` });
}).listen(port, "127.0.0.1");
