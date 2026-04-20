import axios from "axios";
import { bookingSchema } from "../validators/ghl.js";

// API Constants
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-04-15"; // For availability and appointment creation
const SEARCH_CONTACTS_VERSION = "2021-07-28"; // For contact operations
const DEFAULT_TIME_ZONE = "Australia/Sydney";
const NUMBER_OF_DAYS_TO_SEARCH = 2;

const bookSlot = async (req, res) => {
  try {
    // Step 1: Validate request body
    const validatedData = validateBookingRequest(req.body);
    let {
      startTime,
      title,
      contactInfo,
      apiKey,
      calendarId,
      locationId,
      endTime,
      timezone // Use provided timezone or default
    } = validatedData;

    timezone = DEFAULT_TIME_ZONE

    // Step 2: Check slot availability
    const availabilityResult = await checkSlotAvailability(
      apiKey,
      calendarId,
      startTime,
      endTime,
      timezone, // Pass timezone to API calls
    );

    if (!availabilityResult.isAvailable) {
      return res.status(200).json({
        msg: "Requested slot is not available, here are some alternatives:",
        alternativeSlots: availabilityResult.alternativeSlots,
      });
    }

    // Step 4: Handle contact (search or create)
    const contactId = await manageContact(apiKey, locationId, contactInfo);

    // Step 5: Book the appointment
    const bookingResponse = await bookAppointment(
      apiKey,
      calendarId,
      locationId,
      contactId,
      startTime,
      title,
    );

    // Step 6: Return successful response
    return res.status(201).json({
      success: true,
      message: "Appointment successfully booked",
      appointment: bookingResponse,
    });
  } catch (error) {
    console.error(
      "Error booking slot:",
      error?.response?.data || error.message,
    );

    // Return appropriate error response
    const statusCode = error.response?.status || 500;
    const errorMessage =
      error.response?.data?.message || error.message || "Failed to book slot";

    return res.status(statusCode).json({
      error: errorMessage,
      details: error.response?.data || error.message,
    });
  }
};

/**
 * Validates the request body using the booking schema
 * @param {object} requestBody - Request body to validate
 * @returns {object} Validated data or throws error
 */
const validateBookingRequest = (requestBody) => {
  const { error, value } = bookingSchema.validate(requestBody);
  if (error) {
    throw new Error(error.details[0].message);
  }
  return value;
};

/**
 * Checks if a specific slot is available
 * @param {string} apiKey - GHL API Key
 * @param {string} calendarId - Calendar ID
 * @param {string} startTime - Start time of slot
 * @param {string} endTime - End time of slot
 * @param {string} timezone - Time zone
 * @returns {object} Availability result with status and alternative slots if needed
 */
const checkSlotAvailability = async (
  apiKey,
  calendarId,
  startTime,
  endTime,
  timezone = DEFAULT_TIME_ZONE,
) => {
  const startTimestamp = new Date(startTime).getTime();
  const endTimestamp = new Date(endTime).getTime();

  // Get available slots from GHL - let the API handle timezone conversion
  const availabilityResponse = await axios.get(
    `${GHL_BASE_URL}/calendars/${calendarId}/free-slots`,
    {
      params: {
        startDate: startTimestamp,
        endDate: endTimestamp,
        timezone: timezone, // Use the provided timezone
      },
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  // Extract available slots (no timezone conversion needed)
  let availableSlots = extractAvailableSlots(availabilityResponse.data);

  console.log("📅 Available slots:", availableSlots);

  // Check if the requested slot is available
  const desiredSlotAvailable = isSlotAvailable(availableSlots, startTime);

  if (!desiredSlotAvailable) {
    // Find alternatives within the next days
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

  return {
    isAvailable: true,
  };
};

/**
 * Extract available slots from API response
 * @param {object} responseData - Response data from API
 * @returns {Array} Array of available slots
 */
const extractAvailableSlots = (responseData) => {
  let availableSlots = [];
  if (responseData.slots) {
    // Handle array format - use slots as they come from API
    availableSlots = responseData.slots.map((slot) => {
      if (typeof slot === "string") {
        return slot; // Keep as ISO string
      } else if (slot.startTime) {
        return slot; // Keep object as is
      }
      return slot;
    });
  } else {
    // Handle date-keyed object format
    Object.keys(responseData).forEach((date) => {
      if (date !== "traceId" && responseData[date].slots) {
        const dateSlots = responseData[date].slots.map((slotTime) => ({
          startTime: slotTime, // Keep as ISO string from API
        }));
        availableSlots.push(...dateSlots);
      }
    });
  }
  return availableSlots;
};

/**
 * Check if a specific slot is available in the list of available slots
 * @param {Array} availableSlots - Array of available slots
 * @param {string} startTime - Start time to check
 * @param {string} endTime - End time to check
 * @returns {boolean} Whether the slot is available
 */
const isSlotAvailable = (availableSlots, startTime) => {
  return availableSlots.some((slot) => {
    if (typeof slot === "string") {
      // If slot is just a string timestamp
      return new Date(slot).getTime() === new Date(startTime).getTime();
    } else {
      // If slot is an object with startTime and endTime
      return (
        new Date(slot.startTime).getTime() === new Date(startTime).getTime()
      );
    }
  });
};

/**
 * Find alternative slots in the next NUMBER_OF_DAYS_TO_SEARCH days
 * @param {string} apiKey - GHL API Key
 * @param {string} calendarId - Calendar ID
 * @param {string} endTime - End time of the original request
 * @param {string} timezone - Time zone
 * @returns {object} Alternative slots information
 */
const findAlternativeSlots = async (
  apiKey,
  calendarId,
  endTime,
  timezone = DEFAULT_TIME_ZONE,
) => {
  const endTimestamp = new Date(endTime).getTime();
  const nextWeekEnd = new Date(endTime);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + NUMBER_OF_DAYS_TO_SEARCH);

  const alternativeResponse = await axios.get(
    `${GHL_BASE_URL}/calendars/${calendarId}/free-slots`,
    {
      params: {
        startDate: endTimestamp,
        endDate: nextWeekEnd.getTime(),
        timezone: timezone, // Use provided timezone
      },
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  // Process alternative slots without timezone conversion
  let alternativeSlots = [];
  if (alternativeResponse.data.slots) {
    alternativeSlots = alternativeResponse.data.slots.map((slot) => ({
      startTime: slot,
      displayTime: new Date(slot).toLocaleString("en-AU", {
        timeZone: timezone,
      }),
    }));
  } else {
    Object.keys(alternativeResponse.data).forEach((date) => {
      if (date !== "traceId" && alternativeResponse.data[date].slots) {
        const dateSlots = alternativeResponse.data[date].slots.map(
          (slotTime) => ({
            startTime: slotTime,
            displayTime: new Date(slotTime).toLocaleString("en-AU", {
              timeZone: timezone,
            }),
          }),
        );
        alternativeSlots.push(...dateSlots);
      }
    });
  }

  return {
    message:
      alternativeSlots.length > 0
        ? "Here are the next available slots:"
        : "No slots available in the next few days. Please try a different date range.",
    slots: alternativeSlots,
  };
};

/**
 * Handles contact management (search or create)
 * @param {string} apiKey - GHL API Key
 * @param {string} locationId - Location ID
 * @param {object} contactInfo - Contact information
 * @returns {string} Contact ID
 */
const manageContact = async (apiKey, locationId, contactInfo) => {
  if (!contactInfo || !contactInfo.phone) {
    console.error("❌ Contact phone number missing");
    throw new Error("Contact phone number is required for booking");
  }

  try {
    const contactId = await searchContact(
      apiKey,
      locationId,
      contactInfo.phone,
    );

    if (contactId) {
      console.log("✅ Found existing contact with ID:", contactId);
      return contactId;
    }

    // Create new contact if not found
    const newContactId = await createContact(apiKey, locationId, contactInfo);
    console.log("✅ Created new contact with ID:", newContactId);
    return newContactId;
  } catch (error) {
    console.error("📋 Error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    throw error;
  }
};

/**
 * Search for a contact by phone number
 * @param {string} apiKey - GHL API Key
 * @param {string} locationId - Location ID
 * @param {string} phoneNumber - Phone number to search
 * @returns {string|null} Contact ID if found, null otherwise
 */
const searchContact = async (apiKey, locationId, phoneNumber) => {
  const searchContactsUrl = `${GHL_BASE_URL}/contacts/search`;

  try {
    const contactSearchResponse = await axios.post(
      searchContactsUrl,
      {
        locationId: locationId,
        page: 1,
        pageLimit: 20,
        filters: [
          {
            field: "phone",
            operator: "contains",
            value: phoneNumber,
          },
        ],
      },
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Version: SEARCH_CONTACTS_VERSION,
        },
      },
    );

    const contacts = contactSearchResponse.data.contacts || [];

    if (contacts.length > 0) {
      return contacts[0].id;
    }
    return null;
  } catch (error) {
    console.error("💥 Error in searchContact:");
    console.error("📋 Error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    throw error;
  }
};

/**
 * Create a new contact
 * @param {string} apiKey - GHL API Key
 * @param {string} locationId - Location ID
 * @param {object} contactInfo - Contact information
 * @returns {string} Contact ID
 */
const createContact = async (apiKey, locationId, contactInfo) => {
  const createContactUrl = `${GHL_BASE_URL}/contacts`;
  const newContactData = {
    locationId: locationId,
    phone: contactInfo.phone,
    firstName: contactInfo.firstName || "",
    lastName: contactInfo.lastName || ""
  };

  try {
    const createContactResponse = await axios.post(
      createContactUrl,
      newContactData,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Version: SEARCH_CONTACTS_VERSION,
        },
      },
    );

    return createContactResponse.data.contact.id;
  } catch (error) {
    console.error("💥 Error in createContact:");
    console.error("📋 Error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });
    throw error;
  }
};

/**
 * Books an appointment in GHL
 * @param {string} apiKey - GHL API Key
 * @param {string} calendarId - Calendar ID
 * @param {string} locationId - Location ID
 * @param {string} contactId - Contact ID
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @param {string} title - Appointment title
 * @param {string} assignedUserId - User ID to assign appointment to
 * @returns {object} Booking response
 */
const bookAppointment = async (
  apiKey,
  calendarId,
  locationId,
  contactId,
  startTime,
  title,
) => {
  const bookingStartTime = new Date(startTime).toISOString();

  const appointmentData = {
    calendarId: calendarId,
    locationId: locationId,
    contactId: contactId,
    startTime: bookingStartTime,
    title: title || "Appointment",
  };

  const bookingResponse = await axios.post(
    `${GHL_BASE_URL}/calendars/events/appointments`,
    appointmentData,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: API_VERSION,
      },
    },
  );

  return bookingResponse.data;
};

export const ghlController = {
  bookSlot,
};
