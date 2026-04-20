import express from "express";
import axios from "axios";

const router = express.Router();

/**
 * POST /dummy-forward-transcript
 *
 * This endpoint simulates a real post-call transcription payload for a call
 * between an "Xpress Lead Manager" agent and a customer interested in marketing services.
 * It forwards the simulated payload to the GHL webhook.
 *
 * No request body is required since we’re simulating the data.
 */
router.post("/forward-transcript", async (req, res) => {
  try {
    // Simulated real call payload data:
    const dummyPayload = {
      "type": "post_call_transcription",
      "event_timestamp": 1739537297,
      "data": {
        "agent_id": "xpress_lead_manager",
        "conversation_id": "xpress_call_001",
        "status": "done",
        "transcript": [
          {
            "role": "agent",
            "message": "Hello, thank you for calling Xpress Lead Manager. How can I assist you with your marketing services today?",
            "tool_calls": null,
            "tool_results": null,
            "feedback": null,
            "time_in_call_secs": 0,
            "conversation_turn_metrics": null
          },
          {
            "role": "customer",
            "message": "Hi, I'm interested in learning about your digital marketing solutions and how they can help grow my business.",
            "tool_calls": null,
            "tool_results": null,
            "feedback": null,
            "time_in_call_secs": 5,
            "conversation_turn_metrics": null
          },
          {
            "role": "agent",
            "message": "Great, we offer a range of services including SEO, social media management, and PPC campaigns. May I know a little about your business?",
            "tool_calls": null,
            "tool_results": null,
            "feedback": null,
            "time_in_call_secs": 10,
            "conversation_turn_metrics": null
          },
          {
            "role": "customer",
            "message": "I run a local retail store, and I'm looking to increase online visibility and drive more foot traffic.",
            "tool_calls": null,
            "tool_results": null,
            "feedback": null,
            "time_in_call_secs": 15,
            "conversation_turn_metrics": null
          },
          {
            "role": "agent",
            "message": "Excellent. Our team specializes in creating custom campaigns tailored to your needs. I'll connect you with our marketing consultant for further details.",
            "tool_calls": null,
            "tool_results": null,
            "feedback": null,
            "time_in_call_secs": 20,
            "conversation_turn_metrics": {
              "convai_llm_service_ttfb": {
                "elapsed_time": 0.45
              },
              "convai_llm_service_ttf_sentence": {
                "elapsed_time": 0.60
              }
            }
          }
        ],
        "metadata": {
          "start_time_unix_secs": 1739537297,
          "call_duration_secs": 30,
          "cost": 300,
          "deletion_settings": {
            "deletion_time_unix_secs": 1802609320,
            "deleted_logs_at_time_unix_secs": null,
            "deleted_audio_at_time_unix_secs": null,
            "deleted_transcript_at_time_unix_secs": null,
            "delete_transcript_and_pii": true,
            "delete_audio": true
          },
          "feedback": {
            "overall_score": null,
            "likes": 1,
            "dislikes": 0
          },
          "authorization_method": "authorization_header",
          "charging": {
            "dev_discount": false
          },
          "termination_reason": "completed"
        },
        "analysis": {
          "evaluation_criteria_results": {},
          "data_collection_results": {},
          "call_successful": "success",
          "transcript_summary": "The call involved a Xpress Lead Manager agent providing detailed information on digital marketing solutions. The agent engaged with a customer who runs a local retail store and is seeking to boost online visibility and drive foot traffic. The conversation concluded with the agent offering to connect the customer with a marketing consultant."
        },
        "conversation_initiation_client_data": {
          "conversation_config_override": {
            "agent": {
              "prompt": null,
              "first_message": null,
              "language": "en"
            },
            "tts": {
              "voice_id": null
            }
          },
          "custom_llm_extra_body": {},
          "dynamic_variables": {
            "customer_name": "John Doe"
          }
        }
      }
    };

    // Your GHL webhook URL (provided)
    const ghlWebhookUrl =
      "https://services.leadconnectorhq.com/hooks/6n9NEXXE8c0e7wgWNcNp/webhook-trigger/b6cd1a93-2845-47d8-89d8-18fc0922adf8";

    // Forward the simulated payload to the GHL webhook
    await axios.post(ghlWebhookUrl, dummyPayload, {
      headers: { "Content-Type": "application/json" }
    });

    // Respond with a confirmation message and the payload that was sent
    res.json({
      message:
        "Call data for marketing services forwarded to GHL webhook successfully",
      payload: dummyPayload
    });
  } catch (error) {
    console.error("Error forwarding simulated call data:", error);
    res.status(500).json({
      error: "Failed to forward simulated call data to GHL webhook"
    });
  }
});

export default router;
