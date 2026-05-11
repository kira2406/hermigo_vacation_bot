export function cleanResponse(text: string): string {
  return text
    .replace(/\n\s*-\s*/g, " - ")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1")
    .replace(/  +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getFlightDateConstraints(startDate: string | undefined, endDate: string | undefined) {
  if (!startDate || !endDate) return null;

  const tripStart = new Date(startDate);
  const tripEnd = new Date(endDate);

  // Depart at least 1 day before trip starts to arrive in time
  const latestDepartDate = new Date(tripStart);
  latestDepartDate.setDate(latestDepartDate.getDate() - 1);

  // Return on the last day or after
  const earliestReturnDate = new Date(tripEnd);

  return {
    // Suggested depart date: day before trip
    suggestedDepartDate: latestDepartDate.toISOString().split("T")[0],
    // Latest acceptable depart date (arrive before trip starts)
    latestDepartDate: latestDepartDate.toISOString().split("T")[0],
    // Earliest acceptable return date (on or after last day)
    earliestReturnDate: earliestReturnDate.toISOString().split("T")[0],
    tripStart: tripStart.toISOString().split("T")[0],
    tripEnd: tripEnd.toISOString().split("T")[0],
  };
}


export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// a reusable formatter for messages
export function formatChatHistory(messages: { timestamp?: string; sender: string; content: string }[]): string {
  if (!messages || messages.length === 0) return "";
  return messages
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");
}

// date formatting for agents
export function formatAgentDate(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  return new Date(dateString).toISOString().split("T")[0];
}