import { db } from "../config/firebase.js";
import { elevenLabsConversationService } from "../services/elevenLabsConversation.js";
import {
  listConversationsSchema,
  getConversationSchema,
} from "../validators/conversation.js";
import {
  canAccessUserData,
  getAccessibleUserIds,
  getRequestingUserId,
  batchGetUsers,
} from "../utils/permissionUtils.js";

export const conversationController = {
  async listConversations(req, res) {
    try {
      const { error, value } = listConversationsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id } = req.body;

      // Get current user from request (requesting user)
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only view conversations for users in your hierarchy.",
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

      let allAgents = [];

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

        // Collect all agents from accessible users
        usersMap.forEach((accessibleUserData, uid) => {
          const agents = accessibleUserData.agents || [];
          allAgents.push(
            ...agents.map((agent) => ({ ...agent, owner_user_id: uid })),
          );
        });
      } else {
        // For regular users or when accessing specific user_id: return that user's agents
        const userDoc = await db.collection("users").doc(user_id).get();
        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        allAgents = userData.agents || [];
      }

      // Get conversations for each agent
      const conversationsPromises = allAgents.map(async (agent) => {
        try {
          const response =
            await elevenLabsConversationService.listConversations(
              agent.agent_id,
            );
          return (response.conversations || []).map((conv) => ({
            ...conv,
            owner_user_id: agent.owner_user_id || user_id,
            agent_name: agent.name,
          }));
        } catch (error) {
          console.error(
            `Error fetching conversations for agent ${agent.agent_id}:`,
            error,
          );
          return [];
        }
      });

      const conversationsArrays = await Promise.all(conversationsPromises);

      // Combine all conversations into a single array
      const allConversations = conversationsArrays.flat();

      // Sort conversations by start time (most recent first)
      allConversations.sort(
        (a, b) => b.start_time_unix_secs - a.start_time_unix_secs,
      );

      res.json({
        conversations: allConversations,
        has_more: false,
      });
    } catch (error) {
      console.error("Error listing conversations:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  },

  async getConversation(req, res) {
    try {
      const { error, value } = getConversationSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, conversation_id } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only view conversations for users in your hierarchy.",
        });
      }

      // Verify user exists
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get conversation data and audio
      const { conversation, audio } =
        await elevenLabsConversationService.getConversation(conversation_id);

      res.json({
        conversation,
        audio,
      });
    } catch (error) {
      console.error("Error getting conversation:", error);
      res.status(500).json({ error: "Failed to get conversation" });
    }
  },

  async getAudio(req, res) {
    try {
      const { conversation_id } = req.params;
      const { audio } =
        await elevenLabsConversationService.getConversation(conversation_id);

      const audioBuffer = Buffer.from(audio, "base64");

      res.set({
        "Content-Type": "audio/wav",
        "Content-Disposition": `attachment; filename="recording-${conversation_id}.wav"`,
        "Content-Length": audioBuffer.length,
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("Error getting audio:", error);
      res.status(500).json({ error: "Failed to get audio" });
    }
  },
};
