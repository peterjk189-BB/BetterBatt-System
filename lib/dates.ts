/** Today's date (yyyy-mm-dd) in Melbourne time, wherever the code runs (the server runs on UTC, which is a day behind until about 11am here). */
export const todayAU = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
