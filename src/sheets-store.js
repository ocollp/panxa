import { validate } from "./domain.js";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const HEADERS = [
  "Data",
  "Què vaig menjar",
  "Símptomes",
  "Intensitat (0-10)",
  "Temps fins als símptomes",
  "Notes",
];
const TITLE = "PANXA";
export function decodeRows(values = []) {
  if (!values.length) return [];
  if (JSON.stringify(values[0]) !== JSON.stringify(HEADERS))
    throw new Error(
      "La pestanya PANXA té un format desconegut. No s’ha modificat cap dada.",
    );
  const rows = values
    .slice(1)
    .filter((row) => row.some((v) => v !== "" && v !== null));
  const records = rows.map((r, index) => {
    try {
      if (r[3] === "" || r[3] == null) throw new Error();
      return validate({
        date: r[0],
        food: r[1],
        symptoms: String(r[2] || "")
          .split(", ")
          .filter(Boolean),
        intensity: Number(r[3]),
        delay: r[4] || "",
        notes: r[5] || "",
      });
    } catch {
      throw new Error(
        `Revisa la fila ${index + 2} de PANXA: conté un registre no vàlid. No s’ha modificat el full.`,
      );
    }
  });
  if (new Set(records.map((r) => r.date)).size !== records.length)
    throw new Error(
      "El full conté dates duplicades. Revisa-les abans de continuar.",
    );
  return records;
}
export const encodeRows = (records) => [
  HEADERS,
  ...records.map((r) => [
    r.date,
    r.food,
    r.symptoms.join(", "),
    r.intensity,
    r.delay,
    r.notes,
  ]),
];
export function createSheetsStore({
  spreadsheetId,
  getToken,
  fetchImpl = fetch,
}) {
  let queue = Promise.resolve();
  const locked = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const call = async (owner, path, body) => {
    if (!spreadsheetId)
      throw new Error(
        "Cal configurar l’identificador del full de Google Sheets.",
      );
    const token = getToken(owner);
    let res;
    try {
      res = await fetchImpl(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${path}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch {
      throw new Error(
        "No s’ha pogut confirmar l’operació amb Google Sheets. Actualitza el diari abans de tornar-ho a provar.",
      );
    }
    if (!res.ok) {
      const e = new Error(
        res.status === 401
          ? "Cal tornar a connectar Google Sheets."
          : res.status === 403
            ? "Google no permet accedir al full. Revisa els permisos del compte i que Google Sheets API estigui activada."
            : res.status === 404
              ? "No s’ha trobat el full configurat o el teu compte no hi té accés."
              : "Google Sheets no ha pogut completar l’operació. Actualitza el diari abans de reintentar-la.",
      );
      e.statusCode = res.status === 401 ? 428 : 400;
      throw e;
    }
    return res.json();
  };
  const read = async (owner) => {
    const metadata = await call(
      owner,
      "?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))",
    );
    const sheet = metadata.sheets?.find(
      (s) => s.properties.title === TITLE,
    )?.properties;
    if (!sheet) return { sheet: null, records: [] };
    const data = await call(
      owner,
      `/values/${encodeURIComponent("'PANXA'!A:F")}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    return { sheet, records: decodeRows(data.values) };
  };
  const write = async (owner, state, records) => {
    const requests = [];
    let id = state.sheet?.sheetId;
    const values = encodeRows(records);
    if (id == null) {
      id = Math.floor(Math.random() * 2000000000);
      requests.push({
        addSheet: {
          properties: {
            sheetId: id,
            title: TITLE,
            gridProperties: {
              rowCount: Math.max(values.length, 1000),
              columnCount: 6,
              frozenRowCount: 1,
            },
          },
        },
      });
    } else if (values.length > state.sheet.gridProperties.rowCount)
      requests.push({
        appendDimension: {
          sheetId: id,
          dimension: "ROWS",
          length: values.length - state.sheet.gridProperties.rowCount,
        },
      });
    requests.push({
      updateCells: {
        range: {
          sheetId: id,
          startRowIndex: 0,
          endRowIndex: Math.max(values.length, state.records.length + 1),
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        rows: values.map((row) => ({
          values: row.map((value) => ({
            userEnteredValue:
              typeof value === "number"
                ? { numberValue: value }
                : { stringValue: String(value) },
          })),
        })),
        fields: "userEnteredValue",
      },
    });
    if (!state.sheet)
      requests.push({
        repeatCell: {
          range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.18, green: 0.38, blue: 0.3 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
            },
          },
          fields: "userEnteredFormat",
        },
      });
    await call(owner, ":batchUpdate", { requests });
  };
  const conflict = () => {
    const e = new Error(
      "Aquest dia ja existeix o ha canviat al full. Actualitza el diari abans de continuar.",
    );
    e.statusCode = 409;
    throw e;
  };
  return {
    async list(owner) {
      return (await read(owner)).records.sort((a, b) =>
        b.date.localeCompare(a.date),
      );
    },
    save(owner, record, original) {
      const r = validate(record),
        old = original ? validate(original) : null;
      return locked(async () => {
        const state = await read(owner);
        const found = old && state.records.find((x) => x.date === old.date);
        if (old && JSON.stringify(found) !== JSON.stringify(old)) conflict();
        if (
          state.records.some((x) => x.date === r.date && x.date !== old?.date)
        )
          conflict();
        const next = state.records.filter((x) => x.date !== old?.date);
        next.push(r);
        await write(
          owner,
          state,
          next.sort((a, b) => b.date.localeCompare(a.date)),
        );
        return r;
      });
    },
    remove(owner, original) {
      const r = validate(original);
      return locked(async () => {
        const state = await read(owner);
        if (
          JSON.stringify(state.records.find((x) => x.date === r.date)) !==
          JSON.stringify(r)
        )
          conflict();
        await write(
          owner,
          state,
          state.records.filter((x) => x.date !== r.date),
        );
      });
    },
    merge(owner, records) {
      if (!Array.isArray(records) || records.length > 50000)
        throw new Error("La còpia no és vàlida.");
      const clean = records.map(validate);
      if (new Set(clean.map((r) => r.date)).size !== clean.length)
        throw new Error("La còpia conté dates duplicades.");
      return locked(async () => {
        const state = await read(owner),
          next = [...state.records],
          accepted = [],
          conflicts = [];
        let inserted = 0;
        for (const r of clean) {
          const old = next.find((x) => x.date === r.date);
          if (!old) {
            next.push(r);
            inserted++;
            accepted.push(r.date);
          } else if (JSON.stringify(old) === JSON.stringify(r))
            accepted.push(r.date);
          else conflicts.push(r.date);
        }
        if (inserted)
          await write(
            owner,
            state,
            next.sort((a, b) => b.date.localeCompare(a.date)),
          );
        return { inserted, accepted, conflicts };
      });
    },
  };
}
