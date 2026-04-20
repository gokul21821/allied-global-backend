const DEFAULT_TIME_ZONE = "Australia/Sydney";

/**
 * Controller to return current time for agent in a given timezone
 * @route GET /current-time?timezone=Australia/Sydney
 */
export const getCurrentTime = (req, res) => {
  try {
    // Take timezone from query, fallback to default
    const timezone = typeof req.query.timezone === "string" ? req.query.timezone : DEFAULT_TIME_ZONE;

    const now = new Date();

    // Format current time for the agent
    const displayTime = now.toLocaleString("en-AU", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    console.log("Current time Requested for timezone:", timezone, "Current time:", displayTime);

    // Return HTTP JSON response
    return res.status(200).json({
      timezone,
      displayTime,
    });
  } catch (error) {
    console.error("Error getting current time:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
};
