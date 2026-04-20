import axios from "axios";
import dayjs from "dayjs";

// -----------------------------
// CONFIG
// -----------------------------
const OLD_KEY = "sk_f54072004ec81227eb0f86e9f6e2505d8f5cc3210d982e1f";
const OLD_API = "https://api.elevenlabs.io/v1/convai";

// -----------------------------
// SAFE CALL
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
// GET ALL AGENTS
// -----------------------------
async function fetchAllAgents() {
  return safeCall(async () => {
    const res = await axios.get(`${OLD_API}/agents`, {
      headers: { "xi-api-key": OLD_KEY },
    });
    return res.data.agents || [];
  });
}

// -----------------------------
// DELETE AGENT
// -----------------------------
async function deleteAgent(agentId) {
  return safeCall(async () => {
    const res = await axios.delete(`${OLD_API}/agents/${agentId}`, {
      headers: { "xi-api-key": OLD_KEY },
    });
    return res.data;
  });
}

// -----------------------------
// DELETE TODAY'S "Migrated" AGENTS
// -----------------------------
async function deleteTodaysMigratedAgents() {
  const agents = await fetchAllAgents();
  console.log(`Found ${agents.length} agents in old account.`);

  const today = dayjs().format("YYYY-MM-DD");

  for (const agent of agents) {
    const agentId = agent.agent_id; // fix here
    const isMigrated = agent.name?.startsWith("Migrated -");
    const createdAt = agent.created_at ? dayjs(agent.created_at).format("YYYY-MM-DD") : null;

    if (isMigrated && (!createdAt || createdAt === today)) {
      try {
        console.log(`Deleting agent ${agentId} (${agent.name})...`);
        await deleteAgent(agentId);
        console.log(`✔ Deleted ${agentId}`);
      } catch (e) {
        console.error(`✖ Failed to delete ${agentId}`, e.response?.data || e.message || e);
      }
    }
  }


  console.log("✅ Finished deleting today's migrated agents.");
}

// -----------------------------
// MAIN
// -----------------------------
deleteTodaysMigratedAgents();
