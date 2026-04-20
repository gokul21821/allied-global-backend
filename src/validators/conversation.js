import Joi from "joi";

export const listConversationsSchema = Joi.object({
  user_id: Joi.string().required(),
});

export const getConversationSchema = Joi.object({
  user_id: Joi.string().required(),
  conversation_id: Joi.string().required(),
});
