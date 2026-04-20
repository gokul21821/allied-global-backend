import axios from "axios";
import { bookingSchema } from "../validators/ghl.js";

// API Constants
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-04-15";
const SEARCH_CONTACTS_VERSION = "2021-07-28";
const DEFAULT_TIME_ZONE = "Australia/Sydney";
const NUMBER_OF_DAYS_TO_SEARCH = 2;

const bookSlot = async (req, res) => {
  console.log("➡️ Incoming booking request body:", req.body);

  try {
    // Step 1: Validate request body
    const validatedData = validateBookingRequest(req.body);
    console.log("✅ Validated booking data:", validatedData);

    let {
      startTime,
      endTime,
      title,
      contactInfo,
      apiKey,
      calendarId,
      locationId,
      timezone,
    } = validatedData;

    if (!timezone) {
      timezone = DEFAULT_TIME_ZONE;
      console.log("🕒 Using timezone:", timezone);
    }
    // Step 2: Check slot availability
    console.log("🔎 Checking slot availability...");
    const availabilityResult = await checkSlotAvailability(
      apiKey,
      calendarId,
      startTime,
      endTime,
      timezone,
    );

    console.log("📊 Availability result:", availabilityResult);

    if (!availabilityResult.isAvailable) {
      console.log("❌ Slot not available, returning alternatives");
      return res.status(200).json({
        msg: "Requested slot is not available, here are some alternatives:",
        alternativeSlots: availabilityResult.alternativeSlots,
      });
    }

    // Step 4: Handle contact
    console.log("👤 Managing contact:", contactInfo);
    const contactId = await manageContact(apiKey, locationId, contactInfo);
    console.log("👤 Contact ID resolved:", contactId);

    // Step 5: Book appointment
    console.log("📅 Booking appointment...");
    const bookingResponse = await bookAppointment(
      apiKey,
      calendarId,
      locationId,
      contactId,
      startTime,
      title,
    );

    console.log("✅ Appointment booked successfully:", bookingResponse);

    return res.status(201).json({
      success: true,
      message: "Appointment successfully booked",
      appointment: bookingResponse,
    });
  } catch (error) {
    console.error("💥 Error booking slot");
    console.error("Status:", error.response?.status);
    console.error("Headers:", error.response?.headers);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);

    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message,
      details: error.response?.data || error.message,
    });
  }
};

const validateBookingRequest = (requestBody) => {
  console.log("🧪 Validating request body...");
  const { error, value } = bookingSchema.validate(requestBody);
  if (error) {
    console.error("❌ Validation error:", error.details[0].message);
    throw new Error(error.details[0].message);
  }
  return value;
};

const checkSlotAvailability = async (
  apiKey,
  calendarId,
  startTime,
  endTime,
  timezone,
) => {
  const startTimestamp = new Date(startTime).getTime();
  const endTimestamp = new Date(endTime).getTime();

  console.log("📡 Free-slots request params:", {
    calendarId,
    startTimestamp,
    endTimestamp,
    timezone,
  });

  const availabilityResponse = await axios.get(
    `${GHL_BASE_URL}/calendars/${calendarId}/free-slots`,
    {
      params: {
        startDate: startTimestamp,
        endDate: endTimestamp,
        timezone,
      },
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        Version: API_VERSION,
        "Content-Type": "application/json",
      },
    },
  );

  console.log("📅 Raw availability response:", availabilityResponse.data);

  const availableSlots = extractAvailableSlots(availabilityResponse.data);
  console.log("📅 Parsed available slots:", availableSlots);

  const desiredSlotAvailable = isSlotAvailable(availableSlots, startTime);
  console.log("🎯 Desired slot available:", desiredSlotAvailable);

  if (!desiredSlotAvailable) {
    console.log("🔁 Searching for alternative slots...");
    const alternativeSlots = await findAlternativeSlots(
      apiKey,
      calendarId,
      endTime,
      timezone,
    );

    return {
      isAvailable: false,
      alternativeSlots,
    };
  }

  return { isAvailable: true };
};

const extractAvailableSlots = (responseData) => {
  console.log("🔍 Extracting available slots...");
  let availableSlots = [];

  if (responseData.slots) {
    availableSlots = responseData.slots;
  } else {
    Object.keys(responseData).forEach((date) => {
      if (date !== "traceId" && responseData[date].slots) {
        availableSlots.push(
          ...responseData[date].slots.map((s) => ({ startTime: s })),
        );
      }
    });
  }

  return availableSlots;
};

const isSlotAvailable = (availableSlots, startTime) => {
  console.log("🧠 Checking if requested slot exists...");
  return availableSlots.some((slot) => {
    const slotTime = typeof slot === "string" ? slot : slot.startTime;
    return new Date(slotTime).getTime() === new Date(startTime).getTime();
  });
};

const findAlternativeSlots = async (apiKey, calendarId, endTime, timezone) => {
  const startTimestamp = new Date(endTime).getTime();
  const endDate = new Date(endTime);
  endDate.setDate(endDate.getDate() + NUMBER_OF_DAYS_TO_SEARCH);

  console.log("📡 Alternative slots request:", {
    calendarId,
    startTimestamp,
    endDate: endDate.getTime(),
    timezone,
  });

  const response = await axios.get(
    `${GHL_BASE_URL}/calendars/${calendarId}/free-slots`,
    {
      params: {
        startDate: startTimestamp,
        endDate: endDate.getTime(),
        timezone,
      },
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        Version: API_VERSION,
        "Content-Type": "application/json",
      },
    },
  );

  console.log("📅 Raw alternative slots response:", response.data);

  const slots = [];
  Object.keys(response.data).forEach((date) => {
    if (date !== "traceId" && response.data[date].slots) {
      response.data[date].slots.forEach((slot) => {
        slots.push({
          startTime: slot,
          displayTime: new Date(slot).toLocaleString("en-AU", {
            timeZone: timezone,
          }),
        });
      });
    }
  });

  return {
    message:
      slots.length > 0
        ? "Here are the next available slots:"
        : "No slots available in the next few days.",
    slots,
  };
};

/**
 * Normalize a phone number by stripping non-digit characters (except leading +).
 */
const normalizePhone = (phone) => {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
};

/**
 * Manages contact for booking.
 *
 * Flow (search-first):
 *   1. Search contact by phone (using GET /contacts/ with query param)
 *   2. If found → use that contactId
 *   3. If NOT found → create new contact
 *   4. Safety net: if create fails with duplicate error → use contactId from error meta
 */
const manageContact = async (apiKey, locationId, contactInfo) => {
  console.log("👤 Managing contact:", contactInfo);

  if (!contactInfo?.phone) {
    console.error("❌ Contact phone missing");
    throw new Error("Contact phone number is required");
  }

  const normalizedPhone = normalizePhone(contactInfo.phone);
  console.log("📞 Normalized phone:", normalizedPhone);

  // ──────────────────────────────────────────────
  // Step 1: Search for existing contact by phone
  // ──────────────────────────────────────────────
  console.log("🔎 Step 1: Searching for existing contact by phone...");
  const existingContactId = await searchContactByPhone(
    apiKey,
    locationId,
    normalizedPhone,
  );

  if (existingContactId) {
    console.log(
      "✅ Existing contact found, using contactId:",
      existingContactId,
    );
    return existingContactId;
  }

  // ──────────────────────────────────────────────
  // Step 2: No contact found → create new contact
  // ──────────────────────────────────────────────
  console.log("➕ Step 2: No existing contact found, creating new contact...");
  try {
    const response = await axios.post(
      `${GHL_BASE_URL}/contacts`,
      {
        locationId,
        phone: normalizedPhone,
        firstName: contactInfo.firstName || "",
        lastName: contactInfo.lastName || "",
      },
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          Version: SEARCH_CONTACTS_VERSION,
          "Content-Type": "application/json",
        },
      },
    );

    const newId = response.data?.contact?.id;
    console.log("✅ New contact created successfully:", newId);
    return newId;
  } catch (createError) {
    // ──────────────────────────────────────────────
    // Safety net: if GHL says duplicate, use the contactId from error
    // ──────────────────────────────────────────────
    const errData = createError.response?.data;
    const statusCode = createError.response?.status || errData?.statusCode;

    console.warn("⚠️ Contact creation failed:", {
      statusCode,
      message: errData?.message,
      meta: errData?.meta,
    });

    if (statusCode === 400 && errData?.meta?.contactId) {
      console.log(
        "✅ Duplicate detected — using existing contactId from error:",
        errData.meta.contactId,
      );
      return errData.meta.contactId;
    }

    // Unknown error — throw
    throw createError;
  }
};

/**
 * Searches for a contact by phone using multiple GHL API methods.
 *
 * Method 1: GET /contacts/ with query param (deprecated but reliable for phone lookup)
 * Method 2: POST /contacts/search with phone filter
 *
 * Tries multiple phone format variations to handle format mismatches.
 *
 * @returns {string|null} contactId if found, null otherwise
 */
const searchContactByPhone = async (apiKey, locationId, phone) => {
  console.log("🔎 [NEW CODE] Searching contact by phone:", phone);

  // Build multiple search queries to handle phone format variations
  const searchQueries = [phone];

  // If no '+', try adding one as GHL often stores in E.164 format
  if (!phone.startsWith("+")) {
    searchQueries.push(`+${phone}`);
  }

  // Strip leading + and try full digits
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly !== phone && !searchQueries.includes(digitsOnly)) {
    searchQueries.push(digitsOnly);
  }

  // ── Method 1: GET /contacts/ with query param ──
  // We'll try Method 1 for the most likely candidates first
  const primaryQueries = [phone];
  if (!phone.startsWith("+")) primaryQueries.push(`+${phone}`);

  for (const q of primaryQueries) {
    try {
      console.log(`🔎 Method 1: GET /contacts/ with query: ${q}`);
      const response = await axios.get(`${GHL_BASE_URL}/contacts/`, {
        params: { locationId, query: q },
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          Version: SEARCH_CONTACTS_VERSION,
        },
      });

      const contacts = response.data?.contacts || [];
      if (contacts.length > 0) {
        console.log("✅ Contact found via GET /contacts/:", contacts[0].id);
        return contacts[0].id;
      }
    } catch (err) {
      console.warn("⚠️ Method 1 search failed:", err.message);
    }
  }

  // ── Method 2: POST /contacts/search (Universal Fallback) ──
  // Try all variations including country code stripping
  if (phone.startsWith("+") && phone.length > 4) {
    const withoutPlus = phone.slice(1);
    for (let ccLen = 1; ccLen <= 3; ccLen++) {
      searchQueries.push(withoutPlus.slice(ccLen));
    }
  }

  const uniqueQueries = [...new Set(searchQueries)];

  for (const query of uniqueQueries) {
    try {
      console.log(`🔎 Method 2: POST /contacts/search with filter: ${query}`);
      const response = await axios.post(
        `${GHL_BASE_URL}/contacts/search`,
        {
          locationId,
          page: 1,
          pageLimit: 20,
          filters: [{ field: "phone", operator: "contains", value: query }],
        },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            Version: SEARCH_CONTACTS_VERSION,
            "Content-Type": "application/json",
          },
        },
      );

      const contactId = response.data?.contacts?.[0]?.id;
      if (contactId) {
        console.log("✅ Contact found via POST /contacts/search:", contactId);
        return contactId;
      }
    } catch (err) {
      console.warn("⚠️ Method 2 failed for query:", query, err.message);
    }
  }

  console.log("❌ No existing contact found for phone:", phone);
  return null;
};

const bookAppointment = async (
  apiKey,
  calendarId,
  locationId,
  contactId,
  startTime,
  title,
) => {
  const payload = {
    calendarId,
    locationId,
    contactId,
    startTime: new Date(startTime).toISOString(),
    title: title || "Appointment",
  };

  console.log("📤 Booking payload:", payload);

  const response = await axios.post(
    `${GHL_BASE_URL}/calendars/events/appointments`,
    payload,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        Version: API_VERSION,
        "Content-Type": "application/json",
      },
    },
  );

  console.log("📥 Booking API response:", response.data);
  return response.data;
};

const checkSlots = async (req, res) => {
  try {
    const { apiKey, calendarId, startTime, endTime, timezone } = req.body;

    if (!apiKey || !calendarId || !startTime || !endTime) {
      return res.status(400).json({
        error: "Missing required fields: apiKey, calendarId, startTime, endTime",
      });
    }

    console.log("🔎 Checking slot availability...");
    const availabilityResult = await checkSlotAvailability(
      apiKey,
      calendarId,
      startTime,
      endTime,
      timezone || DEFAULT_TIME_ZONE
    );

    return res.status(200).json({
      success: true,
      ...availabilityResult,
    });
  } catch (error) {
    console.error("💥 Error checking slots:", error.message);
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message,
      details: error.response?.data || error.message,
    });
  }
};

export const ghlController = {
  bookSlot,
  checkSlots,
};
