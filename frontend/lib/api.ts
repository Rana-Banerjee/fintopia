const API_BASE = "http://localhost:8000";

export interface Item {
  id: string;
  name: string;
  item_type: string;
  liquidity: string | null;
  appreciation_rate: number | null;
  appreciation_frequency: string | null;
  start_month: number | null;
  start_year: number | null;
  end_month: number | null;
  end_year: number | null;
}

export interface IncomeExpense {
  id: string;
  name: string;
  ie_type: string;
  frequency: string;
  appreciation_rate: number | null;
  appreciation_frequency: string | null;
  start_month: number | null;
  start_year: number | null;
  end_month: number | null;
  end_year: number | null;
  order: number;
  interest_rate: number | null;
  emi_start_month: number | null;
  emi_start_year: number | null;
  emi_end_month: number | null;
  emi_end_year: number | null;
  balance_disbursed: number | null;
  associated_asset_id: string | null;
  is_fixed_emi: boolean | null;
  fixed_emi_amount: number | null;
}

export interface Summary {
  net_worth: number;
  net_cash: number;
  current_assets: number;
  liquid_liabilities: number;
  semi_liquid_assets: number;
  retirement_assets: number;
  property_assets: number;
  fixed_liabilities: number;
  loan_liabilities: number;
  total_income: number;
  total_expense: number;
  net_cashflow: number;
}

export interface Snapshot {
  month: number;
  year: number;
}

export async function getItems(): Promise<Item[]> {
  const res = await fetch(`${API_BASE}/items`);
  return res.json();
}

export async function createItem(item: Omit<Item, "id">): Promise<Item> {
  const res = await fetch(`${API_BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/items/${id}`, { method: "DELETE" });
}

export async function updateItem(id: string, item: Omit<Item, "id">): Promise<Item> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function getMonthValues(
  month: number,
  year: number
): Promise<{ item_id: number; value: number }[]> {
  const res = await fetch(`${API_BASE}/month-values/${month}/${year}`);
  const data = await res.json();
  return data.values;
}

export async function saveMonthValues(
  month: number,
  year: number,
  values: Record<string, number>
): Promise<void> {
  await fetch(`${API_BASE}/month-values/${month}/${year}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export async function getSnapshots(): Promise<Snapshot[]> {
  const res = await fetch(`${API_BASE}/snapshots`);
  return res.json();
}

export async function deleteSnapshot(month: number, year: number): Promise<void> {
  await fetch(`${API_BASE}/snapshots/${month}/${year}`, { method: "DELETE" });
}

export async function getSummary(month: number, year: number): Promise<Summary> {
  const res = await fetch(`${API_BASE}/summary?month=${month}&year=${year}`);
  return res.json();
}

export const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "bi_monthly", label: "Bi-Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annually" },
  { value: "yearly", label: "Yearly" },
] as const;

export async function getIncomeExpenses(): Promise<IncomeExpense[]> {
  const res = await fetch(`${API_BASE}/income-expenses`);
  return res.json();
}

export async function createIncomeExpense(item: Omit<IncomeExpense, "id">): Promise<IncomeExpense> {
  const res = await fetch(`${API_BASE}/income-expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create income/expense: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteIncomeExpense(id: string): Promise<void> {
  await fetch(`${API_BASE}/income-expenses/${id}`, { method: "DELETE" });
}

export async function updateIncomeExpense(id: string, item: Omit<IncomeExpense, "id">): Promise<IncomeExpense> {
  const res = await fetch(`${API_BASE}/income-expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update income/expense: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getIncomeExpenseValues(
  month: number,
  year: number
): Promise<{ item_id: number; value: number }[]> {
  const res = await fetch(`${API_BASE}/income-expenses/values/${month}/${year}`);
  const data = await res.json();
  return data.values;
}

export async function saveIncomeExpenseValues(
  month: number,
  year: number,
  values: Record<string, number>
): Promise<void> {
  await fetch(`${API_BASE}/income-expenses/values/${month}/${year}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export async function getLoanOutstandingBalances(
  month: number,
  year: number
): Promise<Record<number, number>> {
  const res = await fetch(`${API_BASE}/loan-outstanding-balance/${month}/${year}`);
  return res.json();
}

export async function saveLoanOutstandingBalances(
  month: number,
  year: number,
  balances: Record<string, number>
): Promise<void> {
  await fetch(`${API_BASE}/loan-outstanding-balance/${month}/${year}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(balances),
  });
}