import axios from "axios";
import fs from "fs";
import { db } from "./src/config/firebase.js";

// -----------------------------
// CONFIG
// -----------------------------
const OLD_KEY = "sk_f54072004ec81227eb0f86e9f6e2505d8f5cc3210d982e1f";
const NEW_KEY = "sk_440af7a17008c5661bb9122be82043967a9b0d017d7bbf46";

const OLD_API = "https://api.elevenlabs.io/v1/convai";
const NEW_API = "https://api.elevenlabs.io/v1/convai";

const FAILED_FILE = "./failed_agents_latest.json";
const DEFAULT_VOICE_ID = "2EiwWnXFnvU5JabPnv8n";

// -----------------------------
// LOAD/INIT FAILED LOG FILE
// -----------------------------
let failedLog = [];
if (fs.existsSync(FAILED_FILE)) {
  failedLog = JSON.parse(fs.readFileSync(FAILED_FILE, "utf8"));
}

// -----------------------------
// SAVE FAILURE
// -----------------------------
function saveFailure(agentId, voiceId, reason) {
  failedLog.push({
    agentId,
    voiceId,
    reason,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failedLog, null, 2));
}

// -----------------------------
// SAFE ACCESSOR
// -----------------------------
const safe = (obj, path, fallback) =>
  path
    .split(".")
    .reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ??
  fallback;

// -----------------------------
// RETRY WRAPPER
// -----------------------------
async function safeCall(fn, retries = 3) {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return safeCall(fn, retries - 1);
  }
}

// -----------------------------
// FETCH OLD AGENT
// -----------------------------
async function fetchOldAgent(agentId) {
  return safeCall(async () => {
    const res = await axios.get(`${OLD_API}/agents/${agentId}`, {
      headers: { "xi-api-key": OLD_KEY },
    });
    return res.data;
  });
}

// -----------------------------
// FETCH TOOLS
// -----------------------------
async function fetchOldToolsFromToolIds(toolIds) {
  const tools = [];

  for (const id of toolIds) {
    try {
      const res = await axios.get(`${OLD_API}/tools/${id}`, {
        headers: { "xi-api-key": OLD_KEY },
      });
      tools.push(res.data);
    } catch (err) {
      console.warn(`⚠ Tool ${id} not found in OLD API`);
    }
  }

  return tools;
}

// -----------------------------
// CREATE NEW TOOL
// -----------------------------
async function createNewTool(tool) {
  try {
    const res = await axios.post(
      `${NEW_API}/tools`,
      { tool_config: tool.tool_config },
      { headers: { "xi-api-key": NEW_KEY } }
    );
    return res.data.id;
  } catch (err) {
    console.warn(`⚠ Failed to create tool ${tool.id}: ${err.message}`);
    return null;
  }
}

// -----------------------------
// FALLBACK MODEL
// -----------------------------
const fallbackModel = (modelId, language) =>
  modelId || (language === "en" ? "eleven_flash_v31" : "eleven_turbo_v2_5");

// -----------------------------
// GET SAFE VOICE ID
// -----------------------------
async function getSafeVoiceId(voiceId) {
  const idToCheck = voiceId || DEFAULT_VOICE_ID;
  try {
    await axios.get(`${NEW_API}/voices/${idToCheck}`, {
      headers: { "xi-api-key": NEW_KEY },
    });
    return idToCheck;
  } catch (err) {
    console.warn(
      `⚠ Voice ${voiceId} not found in NEW API, using DEFAULT_VOICE_ID`
    );
    return DEFAULT_VOICE_ID;
  }
}

// -----------------------------
// CREATE NEW AGENT
// -----------------------------
async function createNewAgent(oldAgent, newToolIds) {
  const cfg = oldAgent.conversation_config || {};
  const voiceId = await getSafeVoiceId(safe(cfg, "tts.voice_id", null));

  const payload = {
    name: `Migrated - ${oldAgent.name}`,
    conversation_config: {
      tts: {
        voice_id: voiceId,
        model_id: fallbackModel(
          safe(cfg, "tts.model_id", null),
          safe(cfg, "agent.language", "en")
        ),
      },
      agent: {
        language: safe(cfg, "agent.language", "en"),
        prompt: {
          prompt: safe(cfg, "agent.prompt.prompt", ""),
          llm: safe(cfg, "agent.prompt.llm", "gpt-4o"),
          temperature: safe(cfg, "agent.prompt.temperature", 0.7),
          knowledge_base: safe(cfg, "agent.prompt.knowledge_base", []),
          tool_ids: newToolIds,
        },
      },
      turn: safe(cfg, "turn", {}),
    },
  };

  const res = await axios.post(`${NEW_API}/agents/create`, payload, {
    headers: { "xi-api-key": NEW_KEY },
  });

  return res.data.agent_id;
}

// -----------------------------
// MIGRATE USER AGENTS
// -----------------------------
async function migrateUserAgents(userDoc) {
  const userId = userDoc.id;
  const agentsArray = userDoc.data().agents || [];
  const newAgentsArray = [];

  console.log(`\n🔄 Checking ${agentsArray.length} agents for user ${userId}`);

  for (const agent of agentsArray) {
    const oldId = agent.agent_id;
    let oldAgent = null;

    try {
      console.log(`\n→ Fetching OLD agent ${oldId}`);
      oldAgent = await fetchOldAgent(oldId);

      const toolIds = safe(oldAgent, "conversation_config.agent.tool_ids", []);
      console.log(`→ OLD tool_ids:`, toolIds);

      console.log("→ Fetching OLD tools");
      const oldTools = await fetchOldToolsFromToolIds(toolIds);

      const newToolIds = [];
      for (const t of oldTools) {
        const newToolId = await createNewTool(t);
        if (newToolId) newToolIds.push(newToolId);
      }

      console.log("→ Creating NEW agent");
      const newAgentId = await createNewAgent(oldAgent, newToolIds);

      console.log(`✔ Migrated ${oldId} → ${newAgentId}`);
      newAgentsArray.push({ ...agent, agent_id: newAgentId });
    } catch (e) {
      const voiceId =
        oldAgent?.conversation_config?.tts?.voice_id || DEFAULT_VOICE_ID;

      console.error(
        `✖ ERROR MIGRATING ${oldId}:`,
        e.response?.data || e.message || e
      );

      saveFailure(oldId, voiceId, e.message);
      newAgentsArray.push(agent); // fallback to old agent
    }
  }

  await db.collection("users").doc(userId).update({ agents: newAgentsArray });
  console.log(`✅ Updated Firestore for ${userId}`);
}

// -----------------------------
// MAIN
// -----------------------------
async function migrateAll() {
  const users = await db.collection("users").get();

  for (const user of users.docs) {
    await migrateUserAgents(user);
  }

  console.log("\n🎉 MIGRATION FINISHED");
}

migrateAll();
