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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": webOrigin,
    "Content-Type": "application/json",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, corsHeaders());
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.url === "/api/user/summary") {
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

  if (request.url === "/api/photo/recent") {
    sendJson(response, 200, { sessions: [] });
    return;
  }

  if (request.url === "/api/kanji/list") {
    sendJson(response, 200, kanji);
    return;
  }

  sendJson(response, 404, { message: `No E2E fixture for ${request.method} ${request.url}` });
}).listen(port, "127.0.0.1");
