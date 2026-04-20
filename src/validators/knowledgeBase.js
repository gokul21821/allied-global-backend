import Joi from "joi";

export const createKnowledgeBaseSchema = Joi.object({
  user_id: Joi.string().required(),
  url: Joi.string().uri().optional(),
}).custom((value, helpers) => {
  // Skip validation if URL is provided
  if (value.url) {
    return value;
  }

  // For file uploads, we'll validate in the controller
  return value;
});

export const getKnowledgeBaseSchema = Joi.object({
  user_id: Joi.string().required(),
  document_id: Joi.string().required(),
});

export const deleteKnowledgeBaseSchema = Joi.object({
  user_id: Joi.string().required(),
  document_id: Joi.string().required(),
});

export const listKnowledgeBasesSchema = Joi.object({
  user_id: Joi.string().required(),
  cursor: Joi.string().optional(),
  page_size: Joi.number().integer().min(1).max(100).default(30).optional(),
});

export const getDependentAgentsSchema = Joi.object({
  user_id: Joi.string().required(),
  document_id: Joi.string().required(),
  cursor: Joi.string().optional(),
  page_size: Joi.number().integer().min(1).max(100).default(30).optional(),
});