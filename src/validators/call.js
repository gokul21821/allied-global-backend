import Joi from "joi";

export const initiateCallSchema = Joi.object({
  user_id: Joi.string().required(),
  agent_id: Joi.string().required(),
  from_number: Joi.string().required(),
  to_number: Joi.string().required(),
});

export const outboundCallSchema = Joi.object({
  agentId: Joi.string().required(),
  to_number: Joi.string().required(),
  agent_phone_number_id: Joi.string().required(),
  conversation_initiation_client_data: Joi.object({
    conversation_config_override: Joi.object({
      agent: Joi.object().optional(),
      tts: Joi.object().optional(),
      asr: Joi.object().optional()
    }).optional(),
    custom_llm_extra_body: Joi.object().optional(),
    user_id: Joi.string().allow(null).optional(),
    source_info: Joi.object({
      type: Joi.string().optional(),
      details: Joi.object().optional()
    }).optional(),
    dynamic_variables: Joi.object().pattern(
      Joi.string(),
      Joi.alternatives().try(
        Joi.string().allow(null),
        Joi.number(),
        Joi.boolean()
      )
    ).optional()
  }).allow(null).optional()
});
