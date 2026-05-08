const API_BASE = "http://localhost:8000";

export interface Item {
  id: number;
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
  id: number;
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

export async function deleteItem(id: number): Promise<void> {
  await fetch(`${API_BASE}/items/${id}`, { method: "DELETE" });
}

export async function updateItem(id: number, item: Omit<Item, "id">): Promise<Item> {
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
  values: Record<number, number>
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
  return res.json();
}

export async function deleteIncomeExpense(id: number): Promise<void> {
  await fetch(`${API_BASE}/income-expenses/${id}`, { method: "DELETE" });
}

export async function updateIncomeExpense(id: number, item: Omit<IncomeExpense, "id">): Promise<IncomeExpense> {
  const res = await fetch(`${API_BASE}/income-expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
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
  values: Record<number, number>
): Promise<void> {
  await fetch(`${API_BASE}/income-expenses/values/${month}/${year}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}