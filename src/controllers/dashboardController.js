
import { db } from "../config/firebase.js";
import { elevenLabsConversationService } from "../services/elevenLabsConversation.js";

export const dashboardController = {
  async getUserDashboard(req, res) {
    try {
      const { user_id } = req.params;

      // Check if user exists
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();

      // Get counts from Firebase
      const agentsCount = userData.agents ? userData.agents.length : 0;
      const phoneNumbersCount = userData.phoneNumbers ? userData.phoneNumbers.length : 0;
      const knowledgeBasesCount = userData.knowledgeBases ? userData.knowledgeBases.length : 0;

      // Get last 5 calls history
      let callsHistory = [];
      if (userData.agents && userData.agents.length > 0) {
        try {
          // Get conversations for all user agents
          const allConversations = [];
          
          for (const agent of userData.agents) {
            try {
              const conversations = await elevenLabsConversationService.listConversations(agent.agent_id);
              if (conversations && conversations.conversations) {
                // Add agent_id to each conversation for reference
                const conversationsWithAgent = conversations.conversations.map(conv => ({
                  ...conv,
                  agent_id: agent.agent_id
                }));
                allConversations.push(...conversationsWithAgent);
              }
            } catch (error) {
              console.error(`Error fetching conversations for agent ${agent.agent_id}:`, error.message);
              // Continue with other agents even if one fails
            }
          }

          // Sort by start time and get last 5
          const sortedConversations = allConversations
            .sort((a, b) => (b.start_time_unix_secs || 0) - (a.start_time_unix_secs || 0))
            .slice(0, 5);

          callsHistory = sortedConversations.map(conv => {
            const startTimeUnix = conv.start_time_unix_secs;
            const startTimeDate = startTimeUnix ? new Date(startTimeUnix * 1000) : null;
            
            return {
              conversation_id: conv.conversation_id,
              agent_id: conv.agent_id,
              start_time: startTimeDate ? startTimeDate.toISOString() : null,
              start_time_formatted: startTimeDate ? startTimeDate.toLocaleString() : null,
              start_time_unix: startTimeUnix || null,
              duration_secs: conv.call_duration_secs || 0,
              cost: conv.metadata?.cost || 0,
              termination_reason: conv.metadata?.termination_reason || 'unknown',
              call_successful: conv.call_successful || 'unknown',
              transcript_summary: conv.analysis?.transcript_summary || null
            };
          });
        } catch (error) {
          console.error("Error fetching calls history:", error.message);
          // Don't fail the entire request if calls history fails
        }
      }

      const dashboardData = {
        user_id,
        statistics: {
          agents_count: agentsCount,
          phone_numbers_count: phoneNumbersCount,
          knowledge_bases_count: knowledgeBasesCount,
          total_calls: callsHistory.length
        },
        recent_calls: callsHistory
      };

      res.json(dashboardData);
    } catch (error) {
      console.error("Error fetching user dashboard:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  }
};
