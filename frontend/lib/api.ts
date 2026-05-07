const API_BASE = "http://localhost:8000";

export interface Item {
  id: number;
  name: string;
  item_type: string;
  liquidity: string | null;
  appreciation_rate: number | null;
  appreciation_frequency: string | null;
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