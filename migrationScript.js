// import axios from "axios";
// import { db } from "./src/config/firebase.js"; // your initialized Firestore

// // -----------------------------
// // CONFIG
// // -----------------------------
// const OLD_KEY = "sk_f54072004ec81227eb0f86e9f6e2505d8f5cc3210d982e1f";
// const NEW_KEY = "sk_440af7a17008c5661bb9122be82043967a9b0d017d7bbf46";

// const OLD_API = "https://api.elevenlabs.io/v1/convai";
// const NEW_API = "https://api.elevenlabs.io/v1/convai";

// // -----------------------------
// // SAFE ACCESSOR
// // -----------------------------
// const safe = (obj, path, fallback) =>
//   path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? fallback;

// // -----------------------------
// // RETRY WRAPPER
// // -----------------------------
// async function safeCall(fn, retries = 3) {
//   try {
//     return await fn();
//   } catch (e) {
//     if (retries <= 0) throw e;
//     await new Promise((r) => setTimeout(r, 500));
//     return safeCall(fn, retries - 1);
//   }
// }

// // -----------------------------
// // FETCH OLD AGENT
// // -----------------------------
// async function fetchOldAgent(agentId) {
//   return safeCall(async () => {
//     const res = await axios.get(`${OLD_API}/agents/${agentId}`, {
//       headers: { "xi-api-key": OLD_KEY },
//     });
//     return res.data;
//   });
// }

// // -----------------------------
// // FETCH OLD TOOLS (safe if none)
// // -----------------------------
// async function fetchOldTools(agentId) {
//   return safeCall(async () => {
//     try {
//       const res = await axios.get(`${OLD_API}/agents/${agentId}/tools`, {
//         headers: { "xi-api-key": OLD_KEY },
//       });
//       return res.data.tools || [];
//     } catch (e) {
//       if (e.response?.status === 404) {
//         console.log(`⚠ No tools found for agent ${agentId}`);
//         return []; // return empty array if no tools
//       }
//       throw e;
//     }
//   });
// }

// // -----------------------------
// // CREATE NEW TOOL
// // -----------------------------
// async function createNewTool(tool) {
//   const payload = {
//     name: tool.name,
//     description: tool.description,
//     type: tool.type,
//     definition: tool.definition,
//   };

//   const res = await axios.post(`${NEW_API}/agents/tools/create`, payload, {
//     headers: {
//       "xi-api-key": NEW_KEY,
//       "Content-Type": "application/json",
//     },
//   });

//   return res.data.tool_id;
// }

// // -----------------------------
// // MODEL NORMALIZER
// // -----------------------------
// const fallbackModel = (modelId, language) => {
//   if (!modelId) return language === "en" ? "eleven_flash_v31" : "eleven_turbo_v2_5";
//   return modelId;
// };

// // -----------------------------
// // CREATE NEW AGENT
// // -----------------------------
// async function createNewAgent(oldAgent, newToolIds) {
//   const conversation_config = oldAgent.conversation_config || {};

//   const oldPrompt = safe(conversation_config, "agent.prompt", {});
//   const oldTts = safe(conversation_config, "tts", {});
//   const language = safe(conversation_config, "agent.language", "en");

//   const payload = {
//     name: `Migrated - ${oldAgent.name || "Agent"}`,

//     conversation_config: {
//       tts: {
//         voice_id: safe(oldTts, "voice_id", "default_voice"),
//         model_id: fallbackModel(oldTts.model_id, language),
//       },
//       agent: {
//         language,
//         prompt: {
//           prompt: oldPrompt.prompt || "",
//           llm: oldPrompt.llm || "gpt-4o",
//           temperature: oldPrompt.temperature ?? 0.7,
//           knowledge_base: Array.isArray(oldPrompt.knowledge_base) ? oldPrompt.knowledge_base : [],
//           tool_ids: newToolIds, // new tool IDs or empty
//         },
//       },
//       turn: safe(conversation_config, "turn", {}),
//     },

//     platform_settings: safe(oldAgent, "platform_settings", null),
//     workflow: safe(oldAgent, "workflow", null),
//     tags: safe(oldAgent, "tags", []),
//   };

//   const res = await axios.post(`${NEW_API}/agents/create`, payload, {
//     headers: {
//       "xi-api-key": NEW_KEY,
//       "Content-Type": "application/json",
//     },
//   });

//   return res.data.agent_id;
// }

// // -----------------------------
// // MIGRATE A USER'S AGENTS
// // -----------------------------
// async function migrateUserAgents(userDoc) {
//   const userId = userDoc.id;
//   const data = userDoc.data();
//   const agentsArray = data.agents || [];

//   if (agentsArray.length === 0) {
//     console.log(`User ${userId} has no agents.`);
//     return;
//   }

//   console.log(`\n🔄 Migrating ${agentsArray.length} agents for user ${userId}`);

//   const newAgentsArray = [];

//   for (const agent of agentsArray) {
//     const oldId = agent.agent_id;

//     try {
//       console.log(`\n→ Fetching OLD agent ${oldId}`);
//       const oldAgent = await fetchOldAgent(oldId);

//       console.log("→ Fetching OLD tools");
//       const oldTools = await fetchOldTools(oldId);

//       let newToolIds = [];
//       if (oldTools.length > 0) {
//         console.log("→ Creating NEW tools");
//         for (const t of oldTools) {
//           const newToolId = await createNewTool(t);
//           newToolIds.push(newToolId);
//         }
//       }

//       console.log("→ Creating NEW agent");
//       const newAgentId = await createNewAgent(oldAgent, newToolIds);

//       console.log(`✔ Migrated ${oldId} → ${newAgentId}`);
//       newAgentsArray.push({ ...agent, agent_id: newAgentId });
//     } catch (e) {
//       console.error(`✖ Migration failed for ${oldId}`, e.response?.data || e.message || e);
//       newAgentsArray.push(agent); // fallback to old agent
//     }
//   }

//   await db.collection("users").doc(userId).update({ agents: newAgentsArray });
//   console.log(`✅ Firestore updated for user ${userId}`);
// }

// // -----------------------------
// // MAIN
// // -----------------------------
// async function migrateAll() {
//   const users = await db.collection("users").get();
//   console.log(`Found ${users.size} users\n`);

//   for (const user of users.docs) {
//     await migrateUserAgents(user);
//   }

//   console.log("\n🎉 MIGRATION COMPLETED SUCCESSFULLY");
// }

// migrateAll();

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

const FAILED_FILE = "./failed_agents_2.json";

const DEFAULT_VOICE_ID = "2EiwWnXFnvU5JabPnv8n";

// -----------------------------
// LOAD/INIT FAILED LOG FILE
// -----------------------------
let failedLog = [];
if (fs.existsSync(FAILED_FILE)) {
  failedLog = JSON.parse(fs.readFileSync(FAILED_FILE, "utf8"));
}

// -----------------------------
// APPEND TO FAILED LOG
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
// CHECK IF AGENT EXISTS IN OLD API
// -----------------------------
async function oldAgentExists(agentId) {
  try {
    await axios.get(`${OLD_API}/agents/${agentId}`, {
      headers: { "xi-api-key": OLD_KEY },
    });
    return true;
  } catch (err) {
    return false;
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
// FETCH TOOLS USING tool_ids
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
      console.log(`⚠ Tool ${id} not found in OLD API`);
    }
  }

  return tools;
}

// -----------------------------
// CREATE NEW TOOL
// -----------------------------
async function createNewTool(tool) {
  const res = await axios.post(
    `${NEW_API}/tools`,
    { tool_config: tool.tool_config },
    { headers: { "xi-api-key": NEW_KEY } },
  );

  return res.data.id;
}

// -----------------------------
// FALLBACK MODEL
// -----------------------------
const fallbackModel = (modelId, language) =>
  modelId || (language === "en" ? "eleven_flash_v31" : "eleven_turbo_v2_5");

// -----------------------------
// CREATE NEW AGENT
// -----------------------------
async function createNewAgent(oldAgent, newToolIds) {
  const cfg = oldAgent.conversation_config || {};

  const payload = {
    name: `Migrated - ${oldAgent.name}`,
    conversation_config: {
      tts: {
        voice_id: safe(cfg, "tts.voice_id", DEFAULT_VOICE_ID),
        model_id: fallbackModel(
          safe(cfg, "tts.model_id", null),
          safe(cfg, "agent.language", "en"),
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
    let oldAgent = null; // declare here

    try {
      console.log(`\n→ Fetching OLD agent ${oldId}`);
      oldAgent = await fetchOldAgent(oldId);

      const toolIds = safe(oldAgent, "conversation_config.agent.tool_ids", []);
      console.log(`→ OLD tool_ids:`, toolIds);

      console.log("→ Fetching OLD tools");
      const oldTools = await fetchOldToolsFromToolIds(toolIds);

      let newToolIds = [];
      if (oldTools.length > 0) {
        console.log("→ Creating NEW tools");
        for (const t of oldTools) {
          const newToolId = await createNewTool(t);
          newToolIds.push(newToolId);
        }
      }

      console.log("→ Creating NEW agent");
      const newAgentId = await createNewAgent(oldAgent, newToolIds);

      console.log(`✔ Migrated ${oldId} → ${newAgentId}`);
      newAgentsArray.push({ ...agent, agent_id: newAgentId });
    } catch (e) {
      const voiceId =
        oldAgent?.conversation_config?.tts?.voice_id || DEFAULT_VOICE_ID;

      console.error(
        `✖ ERROR MIGRATING ${oldId}`,
        e.response?.data || e.message || e,
      );

      fs.appendFileSync(
        "failedAgents.json",
        JSON.stringify({
          agent_id: oldId,
          voice_id: voiceId,
          error: e.message,
        }) + "\n",
      );

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
