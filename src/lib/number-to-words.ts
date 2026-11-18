// Converts numbers to written form for LOI tokens.
// 3 → "three"
// 45 → "forty-five"
// 50000 → "fifty thousand and 00/100 dollars"

const ones = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const tens = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

function numberToWordsRaw(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return "negative " + numberToWordsRaw(-n);

  let result = "";

  if (n >= 1_000_000) {
    result += numberToWordsRaw(Math.floor(n / 1_000_000)) + " million ";
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    result += numberToWordsRaw(Math.floor(n / 1_000)) + " thousand ";
    n %= 1_000;
  }
  if (n >= 100) {
    result += ones[Math.floor(n / 100)] + " hundred ";
    n %= 100;
  }
  if (n >= 20) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    result += one > 0 ? `${tens[ten]}-${ones[one]} ` : `${tens[ten]} `;
    n = 0;
  }
  if (n > 0) {
    result += ones[n] + " ";
  }

  return result.trim();
}

/**
 * For day/count fields: "45" → "forty-five"
 * Just the word — the template already has ({{number}}) next to it.
 */
export function numberToWritten(input: string): string {
  const n = parseInt(input, 10);
  if (isNaN(n)) return input;
  return numberToWordsRaw(n);
}

/** "90" → "ninety (90)". Pass a unit for "ninety (90) days". */
export function countPhrase(input: string, unit?: string): string {
  const n = parseInt(String(input).replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(n)) return input;
  const phrase = `${numberToWritten(String(n))} (${n})`;
  return unit ? `${phrase} ${unit}` : phrase;
}

/**
 * For dollar amount fields: "50000" → "fifty thousand and 00/100 dollars"
 * Input can be a raw number or "$50,000" / "$50,000.50".
 */
export function dollarToWritten(input: string): string {
  const cleaned = input.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return input;
  const sign = n < 0 ? "negative " : "";
  const abs = Math.abs(n);
  let dollars = Math.floor(abs + 1e-8);
  let cents = Math.round((abs - dollars) * 100);
  if (cents === 100) {
    dollars += 1;
    cents = 0;
  }
  const centText = String(cents).padStart(2, "0");
  return `${sign}${numberToWordsRaw(dollars)} and ${centText}/100 dollars`;
}

/**
 * Format a raw number as currency: 50000 → "$50,000"
 */
export function formatCurrency(input: string): string {
  const cleaned = input.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  if (isNaN(n)) return input;
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
