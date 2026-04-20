import Joi from "joi";

export const createPhoneNumberSchema = Joi.object({
  user_id: Joi.string().required(),
  phone_number: Joi.string().required(),
  provider: Joi.string().valid("twilio", "sip_trunk").required(),
  label: Joi.string().required(),

  sid: Joi.string().when("provider", {
    is: "twilio",
    then: Joi.string().required(),
  }),
  token: Joi.string().when("provider", {
    is: "twilio",
    then: Joi.string().required(),
  }),

  credentials: Joi.object().when("provider", {
    is: "sip_trunk",
    then: Joi.object({
        username: Joi.string().required(),
        password: Joi.string().required(),
    }).required(),
  }),
  address: Joi.string().when("provider", {
    is: "sip_trunk",
    then: Joi.string().required()
  })
});

export const getPhoneNumberSchema = Joi.object({
  user_id: Joi.string().required(),
  phone_number_id: Joi.string().required(),
});

export const updatePhoneNumberSchema = Joi.object({
  user_id: Joi.string().required(),
  phone_number_id: Joi.string().required(),
  phone_number: Joi.string().optional(),
  provider: Joi.string().valid("twilio").optional(),
  label: Joi.string().optional(),
  sid: Joi.string().optional(),
  token: Joi.string().optional(),
  agent_id: Joi.string().optional(),
});

export const deletePhoneNumberSchema = Joi.object({
  user_id: Joi.string().required(),
  phone_number_id: Joi.string().required(),
});

export const listPhoneNumbersSchema = Joi.object({
  user_id: Joi.string().required(),
});