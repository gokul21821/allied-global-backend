
import Joi from "joi";

export const createBatchCallSchema = Joi.object({
  user_id: Joi.string().required(),
  agent_id: Joi.string().required(),
  agent_phone_number_id: Joi.string().required(),
  call_name: Joi.string().required(),
  scheduled_time_unix: Joi.number().integer().required(),
  recipients: Joi.array().items(
    Joi.object({
      phone_number: Joi.string().required(),
      name: Joi.string().optional(),
      metadata: Joi.object().optional()
    })
  ).min(1).required()
});

export const getBatchCallSchema = Joi.object({
  user_id: Joi.string().required(),
  batch_call_id: Joi.string().required()
});
