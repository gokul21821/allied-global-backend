import { db } from "../config/firebase.js";
import { elevenLabsService } from "../services/elevenLabs.js";
import {
  createAgentSchema,
  getAgentSchema,
  updateAgentSchema,
  deleteAgentSchema,
  listAgentsSchema,
} from "../validators/agent.js";
import admin from "firebase-admin";
import { auditService } from "../services/auditService.js";
import {
  canAccessUserData,
  getAccessibleUserIds,
  getRequestingUserId,
  batchGetUsers,
} from "../utils/permissionUtils.js";

export const agentController = {
  async createAgent(req, res) {
    try {
      const { error, value } = createAgentSchema.validate(req.body);
      if (error) {
        console.log("invalid request");
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, conversation_config, name } = req.body;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can create agents for target user
      // Allow if same user OR if requesting user has access to target user
      if (requestingUserId !== user_id) {
        const canAccess = await canAccessUserData(requestingUserId, user_id);
        if (!canAccess) {
          return res.status(403).json({
            error:
              "Access denied. You can only create agents for users in your hierarchy.",
          });
        }
      }
      // If same user, allow (regular users can create their own agents)
      // Sub-admin/sub-admin-user can also create agents for themselves

      // Create agent in Eleven Labs
      const elevenLabsAgent = await elevenLabsService.createAgent(
        name,
        conversation_config,
      );

      // Store agent reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ agents: [] });
      }

      await userRef.update({
        agents: admin.firestore.FieldValue.arrayUnion({
          agent_id: elevenLabsAgent.agent_id,
          name: name,
          created_at_unix_secs: Math.floor(Date.now() / 1000), // Unix timestamp
        }),
      });

      // Log agent creation
      await auditService.logAgentAction(
        user_id,
        "created",
        elevenLabsAgent.agent_id,
        `Created agent "${name}" with ID ${elevenLabsAgent.agent_id}`,
      );

      res.status(201).json(elevenLabsAgent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ error: "Failed to create agent" });
    }
  },

  // async updateAgent(req, res) {
  //   try {
  //     const { error, value } = updateAgentSchema.validate({
  //       ...req.params,
  //       ...req.body,
  //     });
  //     if (error) {
  //       return res.status(400).json({ error: error.details[0].message });
  //     }

  //     const {
  //       user_id,
  //       agent_id,
  //       conversation_config,
  //       name,
  //       platform_settings,
  //     } = value;

  //     // Get current user from request
  //     const requestingUserId = getRequestingUserId(req, user_id);

  //     // Check if requesting user can access target user's data
  //     const canAccess = await canAccessUserData(requestingUserId, user_id);
  //     if (!canAccess) {
  //       return res.status(403).json({
  //         error: "Access denied. You can only update agents for users in your hierarchy.",
  //       });
  //     }

  //     // Check if agent belongs to user
  //     const userDoc = await db.collection("users").doc(user_id).get();
  //     if (!userDoc.exists) {
  //       return res.status(404).json({ error: "User not found" });
  //     }

  //     const userData = userDoc.data();
  //     const agentIndex = userData.agents?.findIndex(
  //       (agent) => agent.agent_id === agent_id,
  //     );

  //     if (agentIndex === -1) {
  //       return res
  //         .status(404)
  //         .json({ error: "Agent not found or does not belong to user" });
  //     }

  //     // Update agent in Eleven Labs
  //     // Ensure conversation_config.agent.additional_languages is properly structured
  //     const configToSend = conversation_config || {};
  //     if (configToSend.agent) {
  //       // Clean up built_in_tools - remove null values
  //       if (configToSend.agent.prompt && configToSend.agent.prompt.built_in_tools) {
  //         configToSend.agent.prompt.built_in_tools = Object.fromEntries(
  //           Object.entries(configToSend.agent.prompt.built_in_tools).filter(([_, value]) => value !== null)
  //         );
  //       }

  //       // Handle additional_languages - only send if array has items
  //       if (configToSend.agent.additional_languages) {
  //         if (!Array.isArray(configToSend.agent.additional_languages)) {
  //           configToSend.agent.additional_languages = configToSend.agent.additional_languages
  //             ? [configToSend.agent.additional_languages]
  //             : [];
  //         }

  //         // Clean and validate additional_languages
  //         if (Array.isArray(configToSend.agent.additional_languages)) {
  //           const cleanedLanguages = configToSend.agent.additional_languages
  //             .filter(lang => lang && lang.language_code)
  //             .map(lang => {
  //               const cleaned = {
  //                 language_code: lang.language_code,
  //               };
  //               if (lang.voice_id && lang.voice_id.trim()) {
  //                 cleaned.voice_id = lang.voice_id;
  //               }
  //               if (lang.first_message && lang.first_message.trim()) {
  //                 cleaned.first_message = lang.first_message;
  //               }
  //               return cleaned;
  //             });

  //           // Only include if there are languages
  //           if (cleanedLanguages.length > 0) {
  //             configToSend.agent.additional_languages = cleanedLanguages;
  //           } else {
  //             // Remove the field if empty
  //             delete configToSend.agent.additional_languages;
  //           }
  //         }
  //       }
  //     }

  //     const updatedAgent = await elevenLabsService.updateAgent(
  //       agent_id,
  //       name,
  //       configToSend,
  //       platform_settings,
  //     );

  //     // Store additional_languages locally in Firebase since ElevenLabs doesn't return it
  //     const additionalLanguages = configToSend.agent?.additional_languages || [];

  //     // Update agent name and additional_languages in Firebase
  //     const updatedAgents = [...userData.agents];
  //     updatedAgents[agentIndex] = {
  //       ...updatedAgents[agentIndex],
  //       ...(name ? { name: name } : {}),
  //       additional_languages: additionalLanguages,
  //     };
  //     await userDoc.ref.update({ agents: updatedAgents });

  //     // Log agent update
  //     await auditService.logAgentAction(
  //       user_id,
  //       "updated",
  //       agent_id,
  //       `Updated agent "${name || "Unknown"}" with ID ${agent_id}`,
  //     );

  //     // Merge additional_languages into the response since ElevenLabs doesn't return it
  //     if (!updatedAgent.conversation_config) {
  //       updatedAgent.conversation_config = {};
  //     }
  //     if (!updatedAgent.conversation_config.agent) {
  //       updatedAgent.conversation_config.agent = {};
  //     }
  //     updatedAgent.conversation_config.agent.additional_languages = additionalLanguages;

  //     // Return the updated agent data with additional_languages merged
  //     res.json(updatedAgent);
  //   } catch (error) {
  //     console.log("Error updating the agent:", error);
  //     res.status(500).json({ error: "Failed to update agent" });
  //   }
  // },

  async updateAgent(req, res) {
    try {
      const { error, value } = updateAgentSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const {
        user_id,
        agent_id,
        conversation_config,
        name,
        platform_settings,
        workflow,
      } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only update agents for users in your hierarchy.",
        });
      }

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const agentIndex = userData.agents?.findIndex(
        (agent) => agent.agent_id === agent_id,
      );

      if (agentIndex === -1) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Update agent in Eleven Labs
      // Ensure conversation_config.agent.additional_languages is properly structured
      const configToSend = conversation_config || {};
      if (configToSend.agent) {
        // Clean up built_in_tools - remove null values
        if (
          configToSend.agent.prompt &&
          configToSend.agent.prompt.built_in_tools
        ) {
          configToSend.agent.prompt.built_in_tools = Object.fromEntries(
            Object.entries(configToSend.agent.prompt.built_in_tools).filter(
              ([_, value]) => value !== null,
            ),
          );

          // Clean up transfer_to_number tool - validate transfer_type values
          const transferToNumber =
            configToSend.agent.prompt.built_in_tools.transfer_to_number;
          if (
            transferToNumber &&
            transferToNumber.params &&
            transferToNumber.params.transfers
          ) {
            transferToNumber.params.transfers =
              transferToNumber.params.transfers.map((transfer) => {
                // Ensure transfer_type is only 'conference' or 'sip_refer'
                // Default to 'conference' if invalid value
                if (
                  transfer.transfer_type &&
                  !["conference", "sip_refer"].includes(transfer.transfer_type)
                ) {
                  console.warn(
                    `Invalid transfer_type '${transfer.transfer_type}' found, defaulting to 'conference'`,
                  );
                  transfer.transfer_type = "conference";
                }
                return transfer;
              });
          }
        }

        // Handle additional_languages - only send if array has items
        if (configToSend.agent.additional_languages) {
          if (!Array.isArray(configToSend.agent.additional_languages)) {
            configToSend.agent.additional_languages = configToSend.agent
              .additional_languages
              ? [configToSend.agent.additional_languages]
              : [];
          }

          // Clean and validate additional_languages
          if (Array.isArray(configToSend.agent.additional_languages)) {
            const cleanedLanguages = configToSend.agent.additional_languages
              .filter((lang) => lang && lang.language_code)
              .map((lang) => {
                const cleaned = {
                  language_code: lang.language_code,
                };
                if (lang.voice_id && lang.voice_id.trim()) {
                  cleaned.voice_id = lang.voice_id;
                }
                if (lang.first_message && lang.first_message.trim()) {
                  cleaned.first_message = lang.first_message;
                }
                return cleaned;
              });

            // Only include if there are languages
            if (cleanedLanguages.length > 0) {
              configToSend.agent.additional_languages = cleanedLanguages;
            } else {
              // Remove the field if empty
              delete configToSend.agent.additional_languages;
            }
          }
        }
      }

      const updatedAgent = await elevenLabsService.updateAgent(
        agent_id,
        name,
        configToSend,
        platform_settings,
        workflow,
      );

      // Store additional_languages locally in Firebase since ElevenLabs doesn't return it
      const additionalLanguages =
        configToSend.agent?.additional_languages || [];

      // Update agent name and additional_languages in Firebase
      const updatedAgents = [...userData.agents];
      updatedAgents[agentIndex] = {
        ...updatedAgents[agentIndex],
        ...(name ? { name: name } : {}),
        additional_languages: additionalLanguages,
      };
      await userDoc.ref.update({ agents: updatedAgents });

      // Log agent update
      await auditService.logAgentAction(
        user_id,
        "updated",
        agent_id,
        `Updated agent "${name || "Unknown"}" with ID ${agent_id}`,
      );

      // Merge additional_languages into the response since ElevenLabs doesn't return it
      if (!updatedAgent.conversation_config) {
        updatedAgent.conversation_config = {};
      }
      if (!updatedAgent.conversation_config.agent) {
        updatedAgent.conversation_config.agent = {};
      }
      updatedAgent.conversation_config.agent.additional_languages =
        additionalLanguages;

      // Return the updated agent data with additional_languages merged
      res.json(updatedAgent);
    } catch (error) {
      console.log("Error updating the agent:", error);
      res.status(error.status || 500).json({
        error: error.message,
        details: error.details || null,
      });
    }
  },

  async deleteAgent(req, res) {
    try {
      const { error, value } = deleteAgentSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, agent_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only delete agents for users in your hierarchy.",
        });
      }

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const agentExists = userData.agents?.some(
        (agent) => agent.agent_id === agent_id,
      );
      if (!agentExists) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Delete agent from Eleven Labs
      await elevenLabsService.deleteAgent(agent_id);

      // Remove agent from user's agents list
      const updatedAgents = userData.agents.filter(
        (agent) => agent.agent_id !== agent_id,
      );
      await userDoc.ref.update({ agents: updatedAgents });

      // Log agent deletion
      await auditService.logAgentAction(
        user_id,
        "deleted",
        agent_id,
        `Deleted agent with ID ${agent_id}`,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ error: "Failed to delete agent" });
    }
  },

  async getAgent(req, res) {
    try {
      const { error, value } = getAgentSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, agent_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Get requesting user data to check role
      const requestingUserDoc = await db
        .collection("users")
        .doc(requestingUserId)
        .get();
      if (!requestingUserDoc.exists) {
        return res.status(404).json({ error: "Requesting user not found" });
      }

      const requestingUserData = requestingUserDoc.data();
      const requestingUserRole = requestingUserData.role;

      // For sub-admin and sub-admin-user: check if agent exists in accessible hierarchy
      let agentOwnerUserId = user_id;
      let agentMetadata = null;

      if (
        (requestingUserRole === "sub-admin" ||
          requestingUserRole === "sub-admin-user") &&
        requestingUserId === user_id
      ) {
        // When accessing their own endpoint, search in all accessible users
        const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
        const usersMap = await batchGetUsers(accessibleUserIds);

        // Find which user owns this agent
        let found = false;
        for (const [uid, userData] of usersMap) {
          const userAgents = userData.agents || [];
          const foundAgent = userAgents.find(
            (agent) => agent.agent_id === agent_id,
          );
          if (foundAgent) {
            agentOwnerUserId = uid;
            agentMetadata = foundAgent;
            found = true;
            break;
          }
        }

        if (!found) {
          return res.status(404).json({
            error: "Agent not found or does not belong to your hierarchy",
          });
        }
      } else {
        // Check if requesting user can access target user's data
        const canAccess = await canAccessUserData(requestingUserId, user_id);
        if (!canAccess) {
          return res.status(403).json({
            error:
              "Access denied. You can only view agents for users in your hierarchy.",
          });
        }

        // Check if agent belongs to user
        const userDoc = await db.collection("users").doc(user_id).get();

        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        agentMetadata = userData.agents?.find(
          (agent) => agent.agent_id === agent_id,
        );

        if (!agentMetadata) {
          return res
            .status(404)
            .json({ error: "Agent not found or does not belong to user" });
        }
      }

      // Get agent details from Eleven Labs
      const agentDetails = await elevenLabsService.getAgent(agent_id);

      // Merge additional_languages from Firebase (ElevenLabs doesn't return it)
      if (agentMetadata && agentMetadata.additional_languages) {
        // Ensure conversation_config.agent exists
        if (!agentDetails.conversation_config) {
          agentDetails.conversation_config = {};
        }
        if (!agentDetails.conversation_config.agent) {
          agentDetails.conversation_config.agent = {};
        }
        agentDetails.conversation_config.agent.additional_languages =
          agentMetadata.additional_languages;
      }

      res.json(agentDetails);
    } catch (error) {
      console.error("Error getting agent:", error);
      res.status(500).json({ error: "Failed to get agent" });
    }
  },

  // async listAgents(req, res) {
  //   try {
  //     console.log("Request received");
  //     const user_id = req.uid;
  //     console.log(user_id);

  //     if (!user_id) {
  //       return res.status(400).json({ error: "User ID not found in token" });
  //     }

  //     // Get user's agents from Firebase
  //     const userDoc = await db.collection("users").doc(user_id).get();
  //     if (!userDoc.exists) {
  //       return res.status(404).json({ error: "User not found" });
  //     }

  //     const userData = userDoc.data();
  //     const userAgents = userData.agents || [];

  //     res.json({
  //       agents: userAgents,
  //       has_more: false,
  //       next_cursor: null,
  //     });
  //   } catch (error) {
  //     console.error("Error listing agents:", error);
  //     res.status(500).json({ error: "Failed to list agents" });
  //   }
  // },

  async listAgents(req, res) {
    try {
      const { error, value } = listAgentsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id } = req.params;

      // Get current user from request (requesting user)
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only view agents for users in your hierarchy.",
        });
      }

      // Get requesting user data to check role
      const requestingUserDoc = await db
        .collection("users")
        .doc(requestingUserId)
        .get();
      if (!requestingUserDoc.exists) {
        return res.status(404).json({ error: "Requesting user not found" });
      }

      const requestingUserData = requestingUserDoc.data();
      const requestingUserRole = requestingUserData.role;

      // For sub-admin and sub-admin-user: aggregate agents from all managed users
      if (
        (requestingUserRole === "sub-admin" ||
          requestingUserRole === "sub-admin-user") &&
        requestingUserId === user_id
      ) {
        // Get all accessible user IDs using the utility function
        const accessibleUserIds = await getAccessibleUserIds(requestingUserId);

        // Batch fetch all user documents in parallel
        const usersMap = await batchGetUsers(accessibleUserIds);

        // Aggregate agents from all accessible users
        const allAgents = [];

        usersMap.forEach((userData, uid) => {
          const userAgents = userData.agents || [];
          // Add user_id to each agent for identification
          userAgents.forEach((agent) => {
            allAgents.push({
              ...agent,
              owner_user_id: uid, // Track which user owns this agent
            });
          });
        });

        res.json({
          agents: allAgents,
          has_more: false,
          next_cursor: null,
        });
      } else {
        // For regular users or when accessing specific user_id: return that user's agents
        const userDoc = await db.collection("users").doc(user_id).get();
        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const userAgents = userData.agents || [];

        res.json({
          agents: userAgents,
          has_more: false,
          next_cursor: null,
        });
      }
    } catch (error) {
      console.error("Error listing agents:", error);
      res.status(500).json({ error: "Failed to list agents" });
    }
  },
};
