import type { ActivityEvent } from "./types";

// Fictional people and data. Ruth's Tuesday, as her bank, phone carrier and email would report it.
export const PEOPLE = {
  parent: { name: "Ruth Alvarez", first: "Ruth", age: 81, city: "Tucson, AZ" },
  family: { name: "Elena Alvarez", first: "Elena", relation: "daughter", city: "Chicago, IL" },
  grandson: { first: "Danny" },
};

export const DAY: ActivityEvent[] = [
  { id: "e1", at: "07:42", kind: "card", title: "Safeway", detail: "Groceries", category: "groceries", amount: 46.18 },
  { id: "e2", at: "08:15", kind: "call", title: "Dr. Patel's office", detail: "Incoming · 3 min", category: "medical", from: "(520) 555-0110", contactKnown: true, durationMin: 3 },
  { id: "e3", at: "09:03", kind: "card", title: "CVS Pharmacy", detail: "Prescription refill", category: "pharmacy", amount: 12.4 },
  { id: "e4", at: "09:40", kind: "text", title: "Carmen (neighbor)", detail: "Walk at 5 like always? 🌵", category: "social", from: "(520) 555-0162", contactKnown: true, body: "Walk at 5 like always?" },
  { id: "e5", at: "10:21", kind: "email", title: "Tucson Electric Power", detail: "Your September bill is ready: $88.20", category: "utilities", from: "billing@tep.example", contactKnown: true, body: "Your September bill is ready." },
  { id: "e6", at: "11:02", kind: "call", title: "Unknown caller", detail: "Incoming · 14 min", from: "(602) 555-0187", contactKnown: false, durationMin: 14 },
  {
    id: "e7", at: "11:05", kind: "text", title: "(602) 555-0187", from: "(602) 555-0187", contactKnown: false,
    detail: "Grandma it's Danny. I got in an accident and they're holding me…",
    body: "Grandma it's Danny. I got in an accident and they're holding me. Please don't tell Mom, I'm so embarrassed. My lawyer Mr. Collins will call you.",
  },
  { id: "e8", at: "11:19", kind: "call", title: "Unknown caller", detail: "Incoming · 9 min", from: "(844) 555-0142", callerId: "COLLINS LEGAL", contactKnown: false, durationMin: 9 },
  { id: "e9", at: "11:52", kind: "card", title: "Walgreens", detail: "3 × $500 gift cards · authorization pending", category: "gift_cards", amount: 1500 },
  { id: "e10", at: "11:58", kind: "bank", title: "New payee added", detail: "J. Collins Legal Services", category: "payee_added", payee: "J. Collins Legal Services" },
  { id: "e11", at: "12:04", kind: "bank", title: "Wire transfer", detail: "To J. Collins Legal Services · pending", category: "wire", amount: 7500, payee: "J. Collins Legal Services", payeeAddedAt: "11:58" },
  {
    id: "e12", at: "12:09", kind: "text", title: "(844) 555-0142", from: "(844) 555-0142", contactKnown: false,
    detail: "Scratch the backs and send photos of all 3 cards…",
    body: "Scratch the backs and send photos of all 3 cards. Bail hearing is at 1. Don't tell anyone, there is a gag order.",
  },
  { id: "e13", at: "12:14", kind: "bank", title: "Hold release requested", detail: "From Ruth's banking app · wire $7,500", category: "hold_release_request", targetEventId: "e11" },
  { id: "e14", at: "13:30", kind: "card", title: "Blue Bird Café", detail: "Lunch", category: "dining", amount: 9.75 },
];

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
