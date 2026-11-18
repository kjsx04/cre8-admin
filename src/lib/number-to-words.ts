// Converts numbers to written form for LOI tokens
// 3 → "three (3)"
// 50000 → "fifty thousand dollars" (for money)

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
    result += tens[Math.floor(n / 10)] + " ";
    n %= 10;
  }
  if (n > 0) {
    result += ones[n] + " ";
  }

  return result.trim();
}

/**
 * For day/count fields: "3" → "three"
 * Just the word — the template already has ({{number}}) next to it
 */
export function numberToWritten(input: string): string {
  const n = parseInt(input, 10);
  if (isNaN(n)) return input;
  return numberToWordsRaw(n);
}

/**
 * For dollar amount fields: "50000" → "fifty thousand dollars"
 * Input can be raw number or "$50,000" format
 */
export function dollarToWritten(input: string): string {
  // Strip $ and commas to get raw number
  const cleaned = input.replace(/[$,]/g, "").trim();
  const n = parseInt(cleaned, 10);
  if (isNaN(n)) return input;
  return numberToWordsRaw(n) + " dollars";
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
