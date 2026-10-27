import { api } from "./api.js";
import { validate } from "./domain.js";
export async function readRecords() {
  return (await api("/records")).records;
}
export async function saveRecord(record, original) {
  await api("/records", {
    method: "POST",
    body: { record: validate(record), original },
  });
}
export async function deleteRecord(original) {
  await api("/records", { method: "DELETE", body: { original } });
}
export async function mergeRecords(records) {
  return api("/records/import", {
    method: "POST",
    body: { records: records.map(validate) },
  });
}
