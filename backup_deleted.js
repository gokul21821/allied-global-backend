import axios from "axios";
import fs from "fs";

// -----------------------------
// CONFIG
// -----------------------------
const OLD_KEY = "sk_f54072004ec81227eb0f86e9f6e2505d8f5cc3210d982e1f";
const NEW_KEY = "sk_440af7a17008c5661bb9122be82043967a9b0d017d7bbf46";

const OLD_API = "https://api.elevenlabs.io/v1/convai";
const NEW_API = "https://api.elevenlabs.io/v1/convai";

const FAILED_AGENTS_FILE = "./failed_agents.json";
const OUTPUT_FILE = "./failed_agents_mapping.json";

// -----------------------------
// SAFE ACCESSOR
// -----------------------------
const safe = (obj, path, fallback) =>
  path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? fallback;

// -----------------------------
// REDUCE AGENT NAME (remove leading "Migrated - ")
// -----------------------------
function reduceName(name) {
  if (!name) return "";
  return name.replace(/^Migrated -\s*/i, "");
}

// -----------------------------
// FETCH NEW AGENT BY ID
// -----------------------------
async function fetchNewAgent(agentId) {
  try {
    const res = await axios.get(`${NEW_API}/agents/${agentId}`, {
      headers: { "xi-api-key": NEW_KEY },
    });
    return res.data;
  } catch (err) {
    console.warn(`⚠ Failed to fetch new agent ${agentId}: ${err.message}`);
    return null;
  }
}

// -----------------------------
// FETCH ALL OLD AGENTS
// -----------------------------
async function fetchAllOldAgents() {
  try {
    const res = await axios.get(`${OLD_API}/agents`, {
      headers: { "xi-api-key": OLD_KEY },
    });
    return res.data.agents || res.data || [];
  } catch (err) {
    console.error(`✖ Failed to fetch old agents: ${err.message}`);
    return [];
  }
}

// -----------------------------
// MAIN
// -----------------------------
async function recoverFailedAgents() {
  const failedAgents = JSON.parse(fs.readFileSync(FAILED_AGENTS_FILE, "utf8"));

  console.log(`🔄 Fetching all OLD agents...`);
  const oldAgents = await fetchAllOldAgents();

  const mapping = [];

  for (const f of failedAgents) {
    const newAgentId = f.agentId;
    const newAgent = await fetchNewAgent(newAgentId);
    if (!newAgent) continue;

    const reducedNewName = reduceName(safe(newAgent, "name", ""));

    // Find all matching old agents by reduced name
    const oldMatches = oldAgents.filter(
      (a) => reduceName(safe(a, "name", "")) === reducedNewName
    );

    // Pick the latest one (by created_at if available)
    let latestOld = null;
    if (oldMatches.length > 0) {
      latestOld = oldMatches.reduce((latest, curr) => {
        const latestTime = new Date(safe(latest, "created_at", 0)).getTime();
        const currTime = new Date(safe(curr, "created_at", 0)).getTime();
        return currTime >= latestTime ? curr : latest;
      });
    }

    mapping.push({
      agent_name_reduced: reducedNewName,
      agent_id_old_api: latestOld ? latestOld.id : null,
      agent_id_new_api: newAgentId,
    });

    console.log(
      `✔ Processed: ${newAgentId} → old ID: ${latestOld ? latestOld.id : "NOT FOUND"}`
    );
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2));
  console.log(`\n🎉 Mapping complete! Saved to ${OUTPUT_FILE}`);
}

recoverFailedAgents();
