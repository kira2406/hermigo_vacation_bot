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