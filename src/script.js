import { db } from "./config/firebase.js";

//migration script for renaming agent fields

async function renameAgentFields() {
  console.log("🚀 Starting agent field rename migration...");

  try {
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      console.log("No users found in the database.");
      return;
    }

    console.log(`Found ${usersSnapshot.size} users to process.`);

    let totalUsersUpdated = 0;
    let totalAgentsUpdated = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      if (userAgents.length === 0) {
        console.log(`⏭️  User ${userId}: No agents found, skipping.`);
        continue;
      }

      console.log(`👤 Processing user ${userId} with ${userAgents.length} agents...`);

      let userNeedsUpdate = false;
      const updatedAgents = userAgents.map((agent, index) => {
        const updatedAgent = { ...agent };
        let agentModified = false;

        // Rename agent_name to name
        if (updatedAgent.agent_name !== undefined) {
          updatedAgent.name = updatedAgent.agent_name;
          delete updatedAgent.agent_name;
          agentModified = true;
          console.log(`  ✅ Renamed agent_name to name for agent ${updatedAgent.agent_id || index}`);
        }

        // Rename agent_createdAt to created_at_unix_secs
        if (updatedAgent.agent_createdAt !== undefined) {
          updatedAgent.created_at_unix_secs = updatedAgent.agent_createdAt;
          delete updatedAgent.agent_createdAt;
          agentModified = true;
          console.log(`  ✅ Renamed agent_createdAt to created_at_unix_secs for agent ${updatedAgent.agent_id || index}`);
        }

        if (agentModified) {
          totalAgentsUpdated++;
          userNeedsUpdate = true;
        }

        return updatedAgent;
      });

      // Update Firebase if any changes were made
      if (userNeedsUpdate) {
        await userDoc.ref.update({ agents: updatedAgents });
        totalUsersUpdated++;
        console.log(`  💾 Updated user ${userId} in Firebase`);
      } else {
        console.log(`  ✓ User ${userId}: No field renames needed`);
      }
    }

    console.log("\n🎉 Field rename migration completed!");
    console.log(`📊 Summary:`);
    console.log(`   - Users processed: ${usersSnapshot.size}`);
    console.log(`   - Users updated: ${totalUsersUpdated}`);
    console.log(`   - Agents updated: ${totalAgentsUpdated}`);

  } catch (error) {
    console.error("❌ Error during field rename migration:", error);
    process.exit(1);
  }
}

async function validateFieldRenames() {
  console.log("\n🔍 Validating field renames...");

  try {
    const usersSnapshot = await db.collection("users").get();
    let validationErrors = 0;
    let totalAgentsChecked = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      userAgents.forEach((agent, index) => {
        totalAgentsChecked++;

        // Check for old field names that should no longer exist
        if (agent.agent_name !== undefined) {
          console.log(`❌ User ${userDoc.id}, Agent ${index}: Still has old 'agent_name' field`);
          validationErrors++;
        }

        if (agent.agent_createdAt !== undefined) {
          console.log(`❌ User ${userDoc.id}, Agent ${index}: Still has old 'agent_createdAt' field`);
          validationErrors++;
        }

        // Check that new field names exist (if the agent has data)
        if (Object.keys(agent).length > 1) { // More than just agent_id
          if (agent.name === undefined) {
            console.log(`⚠️  User ${userDoc.id}, Agent ${index}: Missing new 'name' field`);
          }

          if (agent.created_at_unix_secs === undefined) {
            console.log(`⚠️  User ${userDoc.id}, Agent ${index}: Missing new 'created_at_unix_secs' field`);
          }
        }
      });
    }

    console.log(`\n📈 Validation Results:`);
    console.log(`   - Total agents checked: ${totalAgentsChecked}`);

    if (validationErrors === 0) {
      console.log("✅ All agent fields have been successfully renamed!");
    } else {
      console.log(`❌ Found ${validationErrors} validation errors with old field names still present.`);
    }

  } catch (error) {
    console.error("Error during validation:", error);
  }
}

async function showFieldStatus() {
  console.log("\n📋 Current field status across all agents:");

  try {
    const usersSnapshot = await db.collection("users").get();
    let stats = {
      totalAgents: 0,
      hasOldAgentName: 0,
      hasOldAgentCreatedAt: 0,
      hasNewName: 0,
      hasNewCreatedAt: 0
    };

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      userAgents.forEach(agent => {
        stats.totalAgents++;

        if (agent.agent_name !== undefined) stats.hasOldAgentName++;
        if (agent.agent_createdAt !== undefined) stats.hasOldAgentCreatedAt++;
        if (agent.name !== undefined) stats.hasNewName++;
        if (agent.created_at_unix_secs !== undefined) stats.hasNewCreatedAt++;
      });
    }

    console.log(`   - Total agents: ${stats.totalAgents}`);
    console.log(`   - Agents with old 'agent_name': ${stats.hasOldAgentName}`);
    console.log(`   - Agents with old 'agent_createdAt': ${stats.hasOldAgentCreatedAt}`);
    console.log(`   - Agents with new 'name': ${stats.hasNewName}`);
    console.log(`   - Agents with new 'created_at_unix_secs': ${stats.hasNewCreatedAt}`);

  } catch (error) {
    console.error("Error getting field status:", error);
  }
}

// Main execution
async function main() {
  console.log("🔧 Agent Field Rename Migration Script");
  console.log("=====================================");
  console.log("This script will rename:");
  console.log("  • agent_name → name");
  console.log("  • agent_createdAt → created_at_unix_secs\n");

  // Show current status before migration
  await showFieldStatus();

  // Ask for confirmation before proceeding
  if (process.env.NODE_ENV === 'production') {
    console.log("\n⚠️  This script will modify production data!");
    console.log("Make sure you have a backup before proceeding.");
    console.log("Set CONFIRM_FIELD_RENAME=true environment variable to proceed.\n");

    if (process.env.CONFIRM_FIELD_RENAME !== 'true') {
      console.log("Migration cancelled. Set CONFIRM_FIELD_RENAME=true to proceed.");
      process.exit(0);
    }
  }

  try {
    await renameAgentFields();
    await validateFieldRenames();
    await showFieldStatus();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  console.log("\n✨ Field rename migration script completed successfully!");
  process.exit(0);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { renameAgentFields, validateFieldRenames, showFieldStatus };