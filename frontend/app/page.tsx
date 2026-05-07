"use client";

import { useState, useEffect } from "react";
import {
  getItems,
  createItem,
  deleteItem,
  updateItem,
  getMonthValues,
  saveMonthValues,
  getSnapshots,
  deleteSnapshot,
  getSummary,
  Item,
  Summary,
  Snapshot,
} from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const LIQUIDITY_TYPES = [
  { value: "liquid", label: "Liquid" },
  { value: "semi-liquid", label: "Semi-Liquid" },
  { value: "fixed", label: "Fixed" },
  { value: "retirement", label: "Retirement" },
];

const LIABILITY_LIQUIDITY_TYPES = [
  { value: "liquid", label: "Liquid" },
  { value: "fixed", label: "Fixed" },
];

const APPRECIATION_FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "projection">("dashboard");
  const [items, setItems] = useState<Item[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chartSummaries, setChartSummaries] = useState<Summary[]>([]);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return String(now.getMonth() + 1);
  });
  const [currentYear, setCurrentYear] = useState(() => {
    const now = new Date();
    return String(now.getFullYear());
  });
  const [selectedMonthTab, setSelectedMonthTab] = useState<{
    month: number;
    year: number;
  } | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: "",
    item_type: "asset",
    liquidity: "liquid",
    appreciation_rate: "",
    appreciation_frequency: "monthly",
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const [monthValues, setMonthValues] = useState<Record<number, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedMonthTab) {
      loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
    }
  }, [selectedMonthTab, items]);

  async function fetchData() {
    const [itemsData, snapshotsData] = await Promise.all([
      getItems(),
      getSnapshots(),
    ]);
    setItems(itemsData);
    setSnapshots(snapshotsData);

    const summaries = await Promise.all(
      snapshotsData.map((s) => getSummary(s.month, s.year))
    );
    setChartSummaries(summaries);

    if (itemsData.length === 0 && !settingsOpen) {
      setSettingsOpen(true);
    }

    if (selectedMonthTab) {
      loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
    } else if (snapshotsData.length > 0) {
      setSelectedMonthTab(snapshotsData[0]);
    }
  }

  async function loadMonthValues(month: number, year: number) {
    const values = await getMonthValues(month, year);
    const valueMap: Record<number, number> = {};
    values.forEach((v) => {
      valueMap[v.item_id] = v.value;
    });

    if (Object.keys(valueMap).length === 0 && items.length > 0) {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevValues = await getMonthValues(prevMonth, prevYear);
      const prevValueMap: Record<number, number> = {};
      prevValues.forEach((v) => {
        prevValueMap[v.item_id] = v.value;
      });
      setMonthValues(prevValueMap);
    } else {
      setMonthValues(valueMap);
    }

    const summaryData = await getSummary(month, year);
    setSummary(summaryData);
    setHasChanges(false);
  }

  function handleItemChange(
    field: string,
    value: string
  ) {
    setItemForm({ ...itemForm, [field]: value });
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.name) return;

    const payload = {
      name: itemForm.name,
      item_type: itemForm.item_type,
      liquidity: itemForm.liquidity,
      appreciation_rate: itemForm.appreciation_rate
        ? parseFloat(itemForm.appreciation_rate)
        : null,
      appreciation_frequency:
        itemForm.appreciation_rate && itemForm.appreciation_frequency
          ? itemForm.appreciation_frequency
          : null,
    };

    if (editingItemId !== null) {
      await updateItem(editingItemId, payload);
      handleCancelItemEdit();
    } else {
      await createItem(payload);
      setItemForm({
        name: "",
        item_type: "asset",
        liquidity: "liquid",
        appreciation_rate: "",
        appreciation_frequency: "monthly",
      });
    }
    fetchData();
  }

  async function handleDeleteItem(id: number) {
    await deleteItem(id);
    fetchData();
  }

  function handleEditItem(item: Item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      item_type: item.item_type,
      liquidity: item.liquidity || "liquid",
      appreciation_rate: item.appreciation_rate?.toString() || "",
      appreciation_frequency: item.appreciation_frequency || "monthly",
    });
  }

  function handleCancelItemEdit() {
    setEditingItemId(null);
    setItemForm({
      name: "",
      item_type: "asset",
      liquidity: "liquid",
      appreciation_rate: "",
      appreciation_frequency: "monthly",
    });
  }

  function handleValueChange(itemId: number, value: string) {
    setMonthValues({ ...monthValues, [itemId]: parseFloat(value) || 0 });
    setHasChanges(true);
  }

  async function handleSaveMonthValues() {
    if (!selectedMonthTab) return;
    await saveMonthValues(
      selectedMonthTab.month,
      selectedMonthTab.year,
      monthValues
    );
    setHasChanges(false);
    fetchData();
  }

  function handleCancelMonthEdit() {
    if (!selectedMonthTab) return;
    loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
  }

  async function handleDeleteSnapshot(month: number, year: number) {
    const wasSelected = selectedMonthTab?.month === month && selectedMonthTab?.year === year;
    const remaining = snapshots.filter(s => s.month !== month || s.year !== year);
    
    await deleteSnapshot(month, year);
    await fetchData();
    
    if (wasSelected && remaining.length > 0) {
      setSelectedMonthTab(remaining[remaining.length - 1]);
    } else if (remaining.length === 0) {
      setSelectedMonthTab(null);
    }
  }

  function openSettings() {
    setSettingsOpen(true);
  }

  async function handleAddMonth() {
    const month = parseInt(currentMonth);
    const year = parseInt(currentYear);
    if (!snapshots.find((s) => s.month === month && s.year === year)) {
      const initialValues: Record<number, number> = {};
      items.forEach((item) => {
        initialValues[item.id] = 0;
      });
      await saveMonthValues(month, year, initialValues);
      await fetchData();
      setSelectedMonthTab({ month, year });
    }
  }

  const assetItems = items.filter((i) => i.item_type === "asset");
  const liabilityItems = items.filter((i) => i.item_type === "liability");

  const chartData = snapshots.map((s, idx) => {
    const summary = chartSummaries[idx];
    const totalAssets = (summary?.current_assets ?? 0) + (summary?.semi_liquid_assets ?? 0) + (summary?.retirement_assets ?? 0) + (summary?.property_assets ?? 0);
    const totalLiabilities = (summary?.liquid_liabilities ?? 0) + (summary?.fixed_liabilities ?? 0);
    return {
      name: `${s.month}/${s.year}`,
      currentAssets: summary?.current_assets ?? 0,
      semiLiquidAssets: summary?.semi_liquid_assets ?? 0,
      retirementAssets: summary?.retirement_assets ?? 0,
      propertyAssets: summary?.property_assets ?? 0,
      totalAssets,
      liquidLiabilities: summary?.liquid_liabilities ?? 0,
      fixedLiabilities: summary?.fixed_liabilities ?? 0,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      netCash: (summary?.current_assets ?? 0) + (summary?.semi_liquid_assets ?? 0) - (summary?.liquid_liabilities ?? 0),
    };
  });

  const futureSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Fintopia</h1>
          <button
            onClick={openSettings}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Settings
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("projection")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "projection"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Projection
          </button>
        </div>

{activeTab === "dashboard" && (
          <div className="space-y-6">
            {snapshots.length > 0 && (
              <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-4">
                  Snapshot History
                </h2>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="currentAssets" name="Current Assets" stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="semiLiquidAssets" name="Semi-Liquid Assets" stroke="#14b8a6" strokeWidth={2} />
                      <Line type="monotone" dataKey="retirementAssets" name="Retirement Assets" stroke="#0ea5e9" strokeWidth={2} />
                      <Line type="monotone" dataKey="propertyAssets" name="Property Assets" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="totalAssets" name="Total Assets" stroke="#16a34a" strokeWidth={3} />
                      <Line type="monotone" dataKey="liquidLiabilities" name="Liquid Liabilities" stroke="#f97316" strokeWidth={2} />
                      <Line type="monotone" dataKey="fixedLiabilities" name="Fixed Liabilities" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="totalLiabilities" name="Total Liabilities" stroke="#dc2626" strokeWidth={3} />
                      <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#8b5cf6" strokeWidth={3} />
                      <Line type="monotone" dataKey="netCash" name="Net Cash" stroke="#a855f7" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={`${currentYear}-${currentMonth.padStart(2, "0")}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-");
                    setCurrentYear(y);
                    setCurrentMonth(m);
                  }}
                  className="px-3 py-2 border rounded-lg"
                />
                <button
                  onClick={handleAddMonth}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Month
                </button>
              </div>
              {hasChanges && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveMonthValues}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelMonthEdit}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {snapshots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {snapshots.map((s) => (
                  <div
                    key={`${s.month}-${s.year}`}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                      selectedMonthTab?.month === s.month &&
                      selectedMonthTab?.year === s.year
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedMonthTab(s)}
                      className="px-2 py-1"
                    >
                      {s.month}/{s.year}
                    </button>
                    <button
                      onClick={() => handleDeleteSnapshot(s.month, s.year)}
                      className="text-xs hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedMonthTab && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Current Assets</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.current_assets.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Semi-Liquid Assets</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.semi_liquid_assets.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Retirement Assets</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.retirement_assets.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Property Assets</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.property_assets.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Liquid Liabilities</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.liquid_liabilities.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-500">Fixed Liabilities</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      ₹{summary?.fixed_liabilities.toLocaleString('en-IN') ?? 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-t-2 border-green-600">
                    <div className="text-sm text-gray-500">Total Assets</div>
                    <div className="text-2xl font-bold text-green-600">
                      ₹{((summary?.current_assets ?? 0) + (summary?.semi_liquid_assets ?? 0) + (summary?.retirement_assets ?? 0) + (summary?.property_assets ?? 0)).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-t-2 border-red-600">
                    <div className="text-sm text-gray-500">Total Liabilities</div>
                    <div className="text-2xl font-bold text-red-600">
                      ₹{((summary?.liquid_liabilities ?? 0) + (summary?.fixed_liabilities ?? 0)).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold">Assets</h2>
                    {(["liquid", "semi-liquid", "fixed", "retirement"] as const).map(group => {
                      const items = assetItems.filter(i => i.liquidity === group);
                      const total = items.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);
                      return (
                        <div key={group} className="bg-white p-4 rounded-lg shadow">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium capitalize">{group.replace("-", " ")}</span>
                            <span className="text-sm text-gray-600">₹{total.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="space-y-2">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center gap-2">
                                <label className="flex-1 text-sm text-gray-700">{item.name}</label>
                                <input
                                  type="number"
                                  value={monthValues[item.id] ?? 0}
                                  onChange={e => handleValueChange(item.id, e.target.value)}
                                  className="w-28 px-2 py-1 border rounded text-right text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold">Liabilities</h2>
                    {(["liquid", "fixed"] as const).map(group => {
                      const items = liabilityItems.filter(i => i.liquidity === group);
                      const total = items.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);
                      return (
                        <div key={group} className="bg-white p-4 rounded-lg shadow">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium capitalize">{group}</span>
                            <span className="text-sm text-gray-600">₹{total.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="space-y-2">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center gap-2">
                                <label className="flex-1 text-sm text-gray-700">{item.name}</label>
                                <input
                                  type="number"
                                  value={monthValues[item.id] ?? 0}
                                  onChange={e => handleValueChange(item.id, e.target.value)}
                                  className="w-28 px-2 py-1 border rounded text-right text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "projection" && (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <h2 className="text-xl font-semibold text-gray-500">
              Projection feature coming soon
            </h2>
            <p className="text-gray-400 mt-2">
              This tab will allow you to project your net worth into the future.
            </p>
          </div>
        )}

        {settingsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Settings</h3>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-medium mb-3">
                  {editingItemId ? "Edit Item" : "Add New Item"}
                </h4>
                <form onSubmit={handleSaveItem} className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={itemForm.item_type}
                      onChange={(e) =>
                        handleItemChange("item_type", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg"
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name"
                      value={itemForm.name}
                      onChange={(e) => handleItemChange("name", e.target.value)}
                      className="px-3 py-2 border rounded-lg flex-1 min-w-[150px]"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={itemForm.liquidity}
                      onChange={(e) =>
                        handleItemChange("liquidity", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg"
                    >
                      {(itemForm.item_type === "asset" ? LIQUIDITY_TYPES : LIABILITY_LIQUIDITY_TYPES).map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Appreciation Rate (%)"
                      value={itemForm.appreciation_rate}
                      onChange={(e) =>
                        handleItemChange("appreciation_rate", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg w-48"
                    />
                    {itemForm.appreciation_rate && (
                      <select
                        value={itemForm.appreciation_frequency}
                        onChange={(e) =>
                          handleItemChange(
                            "appreciation_frequency",
                            e.target.value
                          )
                        }
                        className="px-3 py-2 border rounded-lg"
                      >
                        {APPRECIATION_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      {editingItemId ? "Update" : "Add"}
                    </button>
                    {editingItemId && (
                      <button
                        type="button"
                        onClick={handleCancelItemEdit}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div>
                <h4 className="text-lg font-medium mb-3">Defined Items</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Name</th>
                        <th className="text-left py-2">Liquidity</th>
                        <th className="text-right py-2">Appreciation</th>
                        <th className="text-right py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 capitalize">
                            {item.item_type}
                          </td>
                          <td className="py-2">{item.name}</td>
                          <td className="py-2 capitalize">
                            {item.liquidity?.replace("-", " ") || "-"}
                          </td>
                          <td className="py-2 text-right">
                            {item.appreciation_rate
                              ? `${item.appreciation_rate}% ${item.appreciation_frequency}`
                              : "-"}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-blue-600 hover:text-blue-800 mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {items.length === 0 && (
                  <p className="text-gray-500 text-center py-4">
                    No items defined yet. Add your first item above.
                  </p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}