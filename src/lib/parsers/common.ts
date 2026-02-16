export const DATE_TOKEN =
  "(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{2,4}|\\d{1,2}-[A-Za-z]{3}-\\d{2,4})";

export function normalizeAmountToken(raw: string): string {
  return raw.replace(/[^\d,.-]/g, "").replace(/,/g, "").trim();
}

export function parseAmountToken(token: string): number | null {
  const normalized = normalizeAmountToken(token);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function toIsoDate(d: string): string {
  const slash = d.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (slash) {
    const dd = slash[1].padStart(2, "0");
    const mm = slash[2].padStart(2, "0");
    let yyyy = slash[3];
    if (yyyy.length === 2) {
      const y = Number(yyyy);
      yyyy = String(y >= 70 ? 1900 + y : 2000 + y);
    }
    return `${yyyy}-${mm}-${dd}`;
  }

  const monthName = d.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{2,4})$/);
  if (monthName) {
    const dd = monthName[1].padStart(2, "0");
    const mmm = monthName[2].toLowerCase();
    const monthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = monthMap[mmm];
    if (!mm) return d;
    let yyyy = monthName[3];
    if (yyyy.length === 2) {
      const y = Number(yyyy);
      yyyy = String(y >= 70 ? 1900 + y : 2000 + y);
    }
    return `${yyyy}-${mm}-${dd}`;
  }

  return d;
}

export function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("upi") || t.includes("imps") || t.includes("neft") || t.includes("rtgs")) return "transfer";
  if (t.includes("atm")) return "cash";
  if (t.includes("salary")) return "income";
  if (t.includes("interest")) return "interest";
  if (t.includes("emi") || t.includes("loan")) return "loan";
  if (t.includes("charge") || t.includes("fee")) return "fees";
  return "uncategorized";
}
