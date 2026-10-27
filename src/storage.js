import { config } from "./config.js";
import { createGoogleSession } from "./google-session.js";
import { createSheetsStore } from "./sheets-store.js";
export const session = createGoogleSession({
  allowedEmail: config.allowedEmail,
});
const store = createSheetsStore({
  spreadsheetId: config.spreadsheetId,
  getToken: () => session.token(),
});
async function run(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.statusCode === 428) {
      session.clear();
      window.dispatchEvent(new Event("panxa:sheets-required"));
    }
    throw error;
  }
}
const mutate = (operation) =>
  run(() =>
    navigator.locks
      ? navigator.locks.request(
          `panxa-sheet-${config.spreadsheetId}`,
          operation,
        )
      : operation(),
  );
export const readRecords = () => run(() => store.list("browser"));
export const saveRecord = (record, original) =>
  mutate(() => store.save("browser", record, original));
export const deleteRecord = (original) =>
  mutate(() => store.remove("browser", original));
export const mergeRecords = (records) =>
  mutate(() => store.merge("browser", records));
