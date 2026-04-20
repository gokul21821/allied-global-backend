import { db } from "./src/config/firebase.js";
import fs from "fs";

const FAILED_FILE = "./failed_agents.json";

// Load failed agents
let failedAgents = [];
if (fs.existsSync(FAILED_FILE)) {
  failedAgents = JSON.parse(fs.readFileSync(FAILED_FILE, "utf8"));
}

// Keep track of total deletions
let totalDeleted = 0;

async function cleanupFailedAgents() {
  console.log(`\n🔄 Starting cleanup of failed agents...`);

  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const agentsArray = userDoc.data().agents || [];

    // Filter out failed agents
    const filteredAgents = agentsArray.filter(agent => {
      return !failedAgents.find(f => f.agentId === agent.agent_id);
    });

    const deletedCount = agentsArray.length - filteredAgents.length;
    totalDeleted += deletedCount;

    if (deletedCount > 0) {
      await db.collection("users").doc(userId).update({ agents: filteredAgents });
      console.log(`✅ User ${userId}: removed ${deletedCount} failed agent(s)`);
    } else {
      console.log(`ℹ User ${userId}: no failed agents to remove`);
    }
  }

  console.log(`\n🎉 Cleanup finished. Total failed agents removed: ${totalDeleted}`);
}

cleanupFailedAgents();
