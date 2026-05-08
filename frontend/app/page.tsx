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
  getIncomeExpenses,
  createIncomeExpense,
  deleteIncomeExpense,
  updateIncomeExpense,
  getIncomeExpenseValues,
  saveIncomeExpenseValues,
  Item,
  IncomeExpense,
  Summary,
  Snapshot,
  FREQUENCY_OPTIONS,
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
import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

  const [incomeExpenses, setIncomeExpenses] = useState<IncomeExpense[]>([]);
  const [ieForm, setIeForm] = useState({
    name: "",
    ie_type: "income",
    frequency: "monthly",
    appreciation_rate: "",
    appreciation_frequency: "monthly",
    start_month: "",
    start_year: "",
    end_month: "",
    end_year: "",
    order: 0,
  });
  const [editingIeId, setEditingIeId] = useState<number | null>(null);
  const [ieValues, setIeValues] = useState<Record<number, number>>({});

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
  const [copyFromSnapshot, setCopyFromSnapshot] = useState<string>("");
  const [addMonthPopoverOpen, setAddMonthPopoverOpen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"assets" | "income">("assets");
  const [itemOrder, setItemOrder] = useState<Record<string, number[]>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("itemOrder");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("expandedGroups");
      if (saved) return JSON.parse(saved);
    }
    return { "asset-liquid": true, "asset-semi-liquid": true, "asset-fixed": true, "asset-retirement": true, "liability-liquid": true, "liability-fixed": true };
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    assets: true,
    liabilities: true,
    income: true,
    expenses: true,
  });
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    netWorth: true,
    totalAssets: true,
    totalLiabilities: true,
    currentAssets: true,
    semiLiquidAssets: true,
    retirementAssets: true,
    propertyAssets: true,
    liquidLiabilities: true,
    fixedLiabilities: true,
    netCash: true,
  });
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
      loadIeValues(selectedMonthTab.month, selectedMonthTab.year);
    }
  }, [selectedMonthTab, incomeExpenses]);

  async function fetchData() {
    const [itemsData, snapshotsData, ieData] = await Promise.all([
      getItems(),
      getSnapshots(),
      getIncomeExpenses(),
    ]);
    setItems(itemsData);
    setSnapshots(snapshotsData);
    setIncomeExpenses(ieData);

    const summaries = await Promise.all(
      snapshotsData.map((s) => getSummary(s.month, s.year))
    );
    setChartSummaries(summaries);

    if (itemsData.length === 0 && !settingsOpen) {
      setSettingsOpen(true);
    }

    if (selectedMonthTab) {
      loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
      loadIeValues(selectedMonthTab.month, selectedMonthTab.year);
    } else if (snapshotsData.length > 0) {
      setSelectedMonthTab(snapshotsData[0]);
    }
  }

  async function loadIeValues(month: number, year: number) {
    const values = await getIncomeExpenseValues(month, year);
    const valueMap: Record<number, number> = {};
    values.forEach((v) => {
      valueMap[v.item_id] = v.value;
    });
    setIeValues(valueMap);
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

  function handleIeChange(field: string, value: string) {
    setIeForm({ ...ieForm, [field]: value });
  }

  async function handleSaveIe(e: React.FormEvent) {
    e.preventDefault();
    if (!ieForm.name) return;

    const payload = {
      name: ieForm.name,
      ie_type: ieForm.ie_type,
      frequency: ieForm.frequency,
      appreciation_rate: ieForm.appreciation_rate ? parseFloat(ieForm.appreciation_rate) : null,
      appreciation_frequency: ieForm.appreciation_rate && ieForm.appreciation_frequency ? ieForm.appreciation_frequency : null,
      start_month: ieForm.start_month ? parseInt(ieForm.start_month) : null,
      start_year: ieForm.start_year ? parseInt(ieForm.start_year) : null,
      end_month: ieForm.end_month ? parseInt(ieForm.end_month) : null,
      end_year: ieForm.end_year ? parseInt(ieForm.end_year) : null,
      order: ieForm.order,
    };

    if (editingIeId !== null) {
      await updateIncomeExpense(editingIeId, payload);
      handleCancelIeEdit();
    } else {
      await createIncomeExpense(payload);
      setIeForm({
        name: "",
        ie_type: "income",
        frequency: "monthly",
        appreciation_rate: "",
        appreciation_frequency: "monthly",
        start_month: "",
        start_year: "",
        end_month: "",
        end_year: "",
        order: 0,
      });
    }
    fetchData();
  }

  async function handleDeleteIe(id: number) {
    await deleteIncomeExpense(id);
    fetchData();
  }

  function handleEditIe(ie: IncomeExpense) {
    setEditingIeId(ie.id);
    setIeForm({
      name: ie.name,
      ie_type: ie.ie_type,
      frequency: ie.frequency,
      appreciation_rate: ie.appreciation_rate?.toString() || "",
      appreciation_frequency: ie.appreciation_frequency || "monthly",
      start_month: ie.start_month?.toString() || "",
      start_year: ie.start_year?.toString() || "",
      end_month: ie.end_month?.toString() || "",
      end_year: ie.end_year?.toString() || "",
      order: ie.order,
    });
  }

  function handleCancelIeEdit() {
    setEditingIeId(null);
    setIeForm({
      name: "",
      ie_type: "income",
      frequency: "monthly",
      appreciation_rate: "",
      appreciation_frequency: "monthly",
      start_month: "",
      start_year: "",
      end_month: "",
      end_year: "",
      order: 0,
    });
  }

  function handleValueChange(itemId: number, value: string) {
    setMonthValues({ ...monthValues, [itemId]: parseFloat(value) || 0 });
    setHasChanges(true);
  }

  function handleIeValueChange(itemId: number, value: string) {
    setIeValues({ ...ieValues, [itemId]: parseFloat(value) || 0 });
    setHasChanges(true);
  }

  function isIeApplicable(frequency: string, month: number): boolean {
    if (frequency === "monthly") return true;
    if (frequency === "bi_monthly") return month % 2 === 0;
    if (frequency === "quarterly") return [1, 4, 7, 10].includes(month);
    if (frequency === "semi_annual") return [4, 10].includes(month);
    if (frequency === "yearly") return month === 4;
    return true;
  }

  async function handleSaveIeValues() {
    if (!selectedMonthTab) return;
    await saveIncomeExpenseValues(
      selectedMonthTab.month,
      selectedMonthTab.year,
      ieValues
    );
    setHasChanges(false);
    fetchData();
  }

  async function handleSaveMonthValues() {
    if (!selectedMonthTab) return;
    await Promise.all([
      saveMonthValues(selectedMonthTab.month, selectedMonthTab.year, monthValues),
      saveIncomeExpenseValues(selectedMonthTab.month, selectedMonthTab.year, ieValues),
    ]);
    setHasChanges(false);
    fetchData();
  }

  function handleCancelMonthEdit() {
    if (!selectedMonthTab) return;
    loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
    loadIeValues(selectedMonthTab.month, selectedMonthTab.year);
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

  function toggleGroup(key: string) {
    const newState = { ...expandedGroups, [key]: !expandedGroups[key] };
    setExpandedGroups(newState);
    localStorage.setItem("expandedGroups", JSON.stringify(newState));
  }

  function toggleSection(key: string) {
    setExpandedSections({ ...expandedSections, [key]: !expandedSections[key] });
  }

  function expandAllSections() {
    setExpandedSections({ assets: true, liabilities: true, income: true, expenses: true });
  }

  function collapseAllSections() {
    setExpandedSections({ assets: false, liabilities: false, income: false, expenses: false });
  }

  function expandAllGroups(keys: string[]) {
    const newState = { ...expandedGroups };
    keys.forEach(key => { newState[key] = true; });
    setExpandedGroups(newState);
    localStorage.setItem("expandedGroups", JSON.stringify(newState));
  }

  function collapseAllGroups(keys: string[]) {
    const newState = { ...expandedGroups };
    keys.forEach(key => { newState[key] = false; });
    setExpandedGroups(newState);
    localStorage.setItem("expandedGroups", JSON.stringify(newState));
  }

  function getOrderedItems(groupItems: Item[], groupKey: string): Item[] {
    const order = itemOrder[groupKey] || [];
    return [...groupItems].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }

  function handleDragEnd(event: DragEndEvent, groupKey: string, groupItems: Item[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    let order = [...(itemOrder[groupKey] || [])];
    
    // Get current order based on items in this group
    const currentItemsOrder = groupItems.map(i => i.id);
    const hasAllItems = order.length === currentItemsOrder.length && currentItemsOrder.every(id => order.includes(id));
    
    if (hasAllItems && order.length > 0) {
      // All items in order array - use exact positions
      const oldIndex = order.indexOf(active.id as number);
      const newIndex = order.indexOf(over.id as number);
      if (oldIndex !== -1 && newIndex !== -1) {
        order.splice(oldIndex, 1);
        order.splice(newIndex, 0, active.id as number);
      }
    } else {
      // Rebuild order from current display order
      const oldIndex = currentItemsOrder.indexOf(active.id as number);
      const newIndex = currentItemsOrder.indexOf(over.id as number);
      if (oldIndex !== -1 && newIndex !== -1) {
        order = [...currentItemsOrder];
        order.splice(oldIndex, 1);
        order.splice(newIndex, 0, active.id as number);
      }
    }
    
    const newItemOrder = { ...itemOrder, [groupKey]: order };
    setItemOrder(newItemOrder);
    localStorage.setItem("itemOrder", JSON.stringify(newItemOrder));
  }

  function SortableItem({
    item,
    groupKey,
  }: {
    item: Item;
    groupKey: string;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-400 hover:text-gray-600 p-1"
            title="Drag to reorder"
          >
            ⋮⋮
          </button>
          <span>{item.name}</span>
        </div>
        <div className="flex items-center gap-1">
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
        </div>
      </div>
    );
  }

  async function handleAddMonth() {
    const month = parseInt(currentMonth);
    const year = parseInt(currentYear);
    if (!snapshots.find((s) => s.month === month && s.year === year)) {
      const initialValues: Record<number, number> = {};
      
      if (copyFromSnapshot) {
        const [srcMonth, srcYear] = copyFromSnapshot.split("-").map(Number);
        const srcValues = await getMonthValues(srcMonth, srcYear);
        srcValues.forEach((v) => {
          initialValues[v.item_id] = v.value;
        });
      } else {
        [...orderedAssetItems, ...orderedLiabilityItems].forEach((item) => {
          initialValues[item.id] = 0;
        });
      }
      
      await saveMonthValues(month, year, initialValues);
      await fetchData();
      setSelectedMonthTab({ month, year });
    }
  }

  async function handleCreateMonth(month: number, year: number, copyFrom: string) {
    if (!snapshots.find((s) => s.month === month && s.year === year)) {
      const initialValues: Record<number, number> = {};
      
      if (copyFrom) {
        const [srcMonth, srcYear] = copyFrom.split("-").map(Number);
        const srcValues = await getMonthValues(srcMonth, srcYear);
        srcValues.forEach((v) => {
          initialValues[v.item_id] = v.value;
        });
      } else {
        [...orderedAssetItems, ...orderedLiabilityItems].forEach((item) => {
          initialValues[item.id] = 0;
        });
      }
      
      await saveMonthValues(month, year, initialValues);
      await fetchData();
      setSelectedMonthTab({ month, year });
      setAddMonthPopoverOpen(false);
    }
  }

  const assetItems = items.filter((i) => i.item_type === "asset");
  const liabilityItems = items.filter((i) => i.item_type === "liability");

  const getOrderedItemsByType = (itemType: string) => {
    const types = itemType === "asset"
      ? ["liquid", "semi-liquid", "fixed", "retirement"]
      : ["liquid", "fixed"];
    return types.flatMap((l) => {
      const groupKey = `${itemType}-${l}`;
      const groupItems = items.filter((i) => i.item_type === itemType && i.liquidity === l);
      return getOrderedItems(groupItems, groupKey);
    });
  };

  const orderedAssetItems = getOrderedItemsByType("asset");
  const orderedLiabilityItems = getOrderedItemsByType("liability");

  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

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
                  <button
                    onClick={() => setGraphCollapsed(!graphCollapsed)}
                    className="w-full flex items-center justify-between mb-4"
                  >
                    <h2 className="text-lg font-semibold">
                      Snapshot History
                    </h2>
                    <span className="text-gray-500">{graphCollapsed ? "▼" : "▲"}</span>
                  </button>
                  {!graphCollapsed && (
                    <>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {Object.entries(visibleLines).map(([key, visible]) => (
                          <button
                            key={key}
                            onClick={() => setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }))}
                            className={`px-2 py-1 text-xs rounded border ${
                              visible
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-500 border-gray-300"
                            }`}
                          >
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                          </button>
                        ))}
                      </div>
                      <div className="h-[500px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip offset={{ x: 10, y: -10 }} wrapperStyle={{ maxWidth: '200px' }} />
                            <Legend />
                            {visibleLines.netWorth && <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#8b5cf6" strokeWidth={3} />}
                            {visibleLines.totalAssets && <Line type="monotone" dataKey="totalAssets" name="Total Assets" stroke="#16a34a" strokeWidth={3} />}
                            {visibleLines.totalLiabilities && <Line type="monotone" dataKey="totalLiabilities" name="Total Liabilities" stroke="#dc2626" strokeWidth={3} />}
                            {visibleLines.currentAssets && <Line type="monotone" dataKey="currentAssets" name="Current Assets" stroke="#22c55e" strokeWidth={2} />}
                            {visibleLines.semiLiquidAssets && <Line type="monotone" dataKey="semiLiquidAssets" name="Semi-Liquid Assets" stroke="#14b8a6" strokeWidth={2} />}
                            {visibleLines.retirementAssets && <Line type="monotone" dataKey="retirementAssets" name="Retirement Assets" stroke="#0ea5e9" strokeWidth={2} />}
                            {visibleLines.propertyAssets && <Line type="monotone" dataKey="propertyAssets" name="Property Assets" stroke="#3b82f6" strokeWidth={2} />}
                            {visibleLines.liquidLiabilities && <Line type="monotone" dataKey="liquidLiabilities" name="Liquid Liabilities" stroke="#f97316" strokeWidth={2} />}
                            {visibleLines.fixedLiabilities && <Line type="monotone" dataKey="fixedLiabilities" name="Fixed Liabilities" stroke="#ef4444" strokeWidth={2} />}
                            {visibleLines.netCash && <Line type="monotone" dataKey="netCash" name="Net Cash" stroke="#a855f7" strokeWidth={2} />}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setAddMonthPopoverOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Month
              </button>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg shadow border-t-4 border-purple-600">
                    <div className="text-sm text-gray-500 text-center">Net Worth</div>
                    <div className="text-2xl font-bold text-purple-600 text-center">
                      ₹{(
                        (summary?.current_assets ?? 0) +
                        (summary?.semi_liquid_assets ?? 0) +
                        (summary?.retirement_assets ?? 0) +
                        (summary?.property_assets ?? 0) -
                        (summary?.liquid_liabilities ?? 0) -
                        (summary?.fixed_liabilities ?? 0)
                      ).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-t-4 border-blue-600">
                    <div className="text-sm text-gray-500 text-center">Net Cash Flow</div>
                    <div className={`text-2xl font-bold text-center ${(summary?.net_cashflow ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{(summary?.net_cashflow ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-t-4 border-indigo-600">
                    <div className="text-sm text-gray-500 text-center">Net Cash</div>
                    <div className="text-2xl font-bold text-indigo-600 text-center">
                      ₹{(summary?.net_cash ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <h3 className="text-lg font-semibold text-green-600">Assets</h3>
                      <span className="text-lg font-bold text-green-600">
                        ₹{(
                          (summary?.current_assets ?? 0) +
                          (summary?.semi_liquid_assets ?? 0) +
                          (summary?.retirement_assets ?? 0) +
                          (summary?.property_assets ?? 0)
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Current</span>
                        <span className="text-sm font-medium">₹{summary?.current_assets.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Semi-Liquid</span>
                        <span className="text-sm font-medium">₹{summary?.semi_liquid_assets.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Retirement</span>
                        <span className="text-sm font-medium">₹{summary?.retirement_assets.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Property</span>
                        <span className="text-sm font-medium">₹{summary?.property_assets.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <h3 className="text-lg font-semibold text-red-600">Liabilities</h3>
                      <span className="text-lg font-bold text-red-600">
                        ₹{(
                          (summary?.liquid_liabilities ?? 0) +
                          (summary?.fixed_liabilities ?? 0)
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Liquid</span>
                        <span className="text-sm font-medium">₹{summary?.liquid_liabilities.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Fixed</span>
                        <span className="text-sm font-medium">₹{summary?.fixed_liabilities.toLocaleString('en-IN') ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-semibold">Assets</h2>
                      <div className="flex gap-2">
                        <button
                          onClick={() => expandAllGroups(["asset-liquid", "asset-semi-liquid", "asset-fixed", "asset-retirement"])}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Expand
                        </button>
                        <button
                          onClick={() => collapseAllGroups(["asset-liquid", "asset-semi-liquid", "asset-fixed", "asset-retirement"])}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Collapse
                        </button>
                      </div>
                    </div>
                    {(["liquid", "semi-liquid", "fixed", "retirement"] as const).map(group => {
                      const groupKey = `asset-${group}`;
                      const items = orderedAssetItems.filter(i => i.liquidity === group);
                      const total = items.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);
                      const isExpanded = expandedGroups[groupKey] ?? true;
                      return (
                        <div key={group} className="bg-white p-4 rounded-lg shadow">
                          <button
                            onClick={() => toggleGroup(groupKey)}
                            className="w-full flex justify-between items-center mb-2"
                          >
                            <span className="font-medium capitalize">{group.replace("-", " ")}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">₹{total.toLocaleString('en-IN')}</span>
                              <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                            </div>
                          </button>
                          {isExpanded && (
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-semibold">Liabilities</h2>
                      <div className="flex gap-2">
                        <button
                          onClick={() => expandAllGroups(["liability-liquid", "liability-fixed"])}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Expand
                        </button>
                        <button
                          onClick={() => collapseAllGroups(["liability-liquid", "liability-fixed"])}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Collapse
                        </button>
                      </div>
                    </div>
                    {(["liquid", "fixed"] as const).map(group => {
                      const groupKey = `liability-${group}`;
                      const items = orderedLiabilityItems.filter(i => i.liquidity === group);
                      const total = items.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);
                      const isExpanded = expandedGroups[groupKey] ?? true;
                      return (
                        <div key={group} className="bg-white p-4 rounded-lg shadow">
                          <button
                            onClick={() => toggleGroup(groupKey)}
                            className="w-full flex justify-between items-center mb-2"
                          >
                            <span className="font-medium capitalize">{group}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">₹{total.toLocaleString('en-IN')}</span>
                              <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                            </div>
                          </button>
                          {isExpanded && (
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 mt-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-4">
                      <button
                        onClick={() => toggleSection("income")}
                        className="flex items-center gap-2 text-lg font-semibold"
                      >
                        <span>{expandedSections.income ? "▼" : "▶"}</span>
                        Income
                      </button>
                      <button
                        onClick={expandedSections.income ? () => collapseAllGroups(["income-income"]) : () => expandAllGroups(["income-income"])}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {expandedSections.income && expandedGroups["income-income"] ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    {expandedSections.income && (
                      <div className="space-y-2">
                        {(() => {
                          const filtered = incomeExpenses.filter(i => i.ie_type === "income" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1));
                          return filtered.map(ie => {
                            const total = ieValues[ie.id] ?? 0;
                            return (
                              <div key={ie.id} className="flex items-center gap-2">
                                <label className="flex-1 text-sm text-gray-700">{ie.name}</label>
                                <span className="text-xs text-gray-500">{FREQUENCY_OPTIONS.find(f => f.value === ie.frequency)?.label}</span>
                                <input
                                  type="number"
                                  value={ieValues[ie.id] ?? 0}
                                  onChange={e => handleIeValueChange(ie.id, e.target.value)}
                                  className="w-28 px-2 py-1 border rounded text-right text-sm"
                                />
                              </div>
                            );
                          });
                        })()}
                        {incomeExpenses.filter(i => i.ie_type === "income" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1)).length === 0 && (
                          <p className="text-sm text-gray-500">No income items defined. Add in Settings.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-4">
                      <button
                        onClick={() => toggleSection("expenses")}
                        className="flex items-center gap-2 text-lg font-semibold"
                      >
                        <span>{expandedSections.expenses ? "▼" : "▶"}</span>
                        Expenses
                      </button>
                      <button
                        onClick={expandedSections.expenses ? () => collapseAllGroups(["income-expense"]) : () => expandAllGroups(["income-expense"])}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {expandedSections.expenses && expandedGroups["income-expense"] ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    {expandedSections.expenses && (
                      <div className="space-y-2">
                        {(() => {
                          const filtered = incomeExpenses.filter(i => i.ie_type === "expense" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1));
                          return filtered.map(ie => {
                            const total = ieValues[ie.id] ?? 0;
                            return (
                              <div key={ie.id} className="flex items-center gap-2">
                                <label className="flex-1 text-sm text-gray-700">{ie.name}</label>
                                <span className="text-xs text-gray-500">{FREQUENCY_OPTIONS.find(f => f.value === ie.frequency)?.label}</span>
                                <input
                                  type="number"
                                  value={ieValues[ie.id] ?? 0}
                                  onChange={e => handleIeValueChange(ie.id, e.target.value)}
                                  className="w-28 px-2 py-1 border rounded text-right text-sm"
                                />
                              </div>
                            );
                          });
                        })()}
                        {incomeExpenses.filter(i => i.ie_type === "expense" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1)).length === 0 && (
                          <p className="text-sm text-gray-500">No expense items defined. Add in Settings.</p>
                        )}
                      </div>
                    )}
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

              <div className="flex border-b mb-4">
                <button
                  onClick={() => setSettingsTab("assets")}
                  className={`px-4 py-2 font-medium ${
                    settingsTab === "assets"
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Assets & Liabilities
                </button>
                <button
                  onClick={() => setSettingsTab("income")}
                  className={`px-4 py-2 font-medium ${
                    settingsTab === "income"
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Income & Expenses
                </button>
              </div>

              <div className={`mb-6 ${settingsTab !== "assets" ? "hidden" : ""}`}>
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

              <div className={`mb-6 ${settingsTab !== "assets" ? "hidden" : ""}`}>
                <h4 className="text-lg font-medium mb-3">Defined Items</h4>
                {items.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No items defined yet. Add your first item above.
                  </p>
                ) : (
                  <>
                    <div className="mb-4">
                      <h5 className="text-md font-semibold mb-2">Assets</h5>
                      {(["liquid", "semi-liquid", "fixed", "retirement"] as const).map((liquidity) => {
                        const allGroupItems = items.filter((i) => i.item_type === "asset" && i.liquidity === liquidity);
                        if (allGroupItems.length === 0) return null;
                        const groupKey = `asset-${liquidity}`;
                        const groupItems = getOrderedItems(allGroupItems, groupKey);
                        return (
                          <div key={groupKey} className="mb-2 border rounded-lg">
                            <button
                              onClick={() => toggleGroup(groupKey)}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                            >
                              <span className="font-medium capitalize">
                                {liquidity.replace("-", " ")} ({groupItems.length})
                              </span>
                              <span>{expandedGroups[groupKey] ? "▼" : "▶"}</span>
                            </button>
                            {expandedGroups[groupKey] && (
                              <DndContext
                                collisionDetection={closestCenter}
                                onDragEnd={(e) => handleDragEnd(e, groupKey, groupItems)}
                              >
                                <SortableContext
                                  items={groupItems.map((i) => i.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div className="border-t px-3 py-2 space-y-2">
                                    {groupItems.map((item) => (
                                      <SortableItem
                                        key={item.id}
                                        item={item}
                                        groupKey={groupKey}
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                              </DndContext>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      <h5 className="text-md font-semibold mb-2">Liabilities</h5>
                      {(["liquid", "fixed"] as const).map((liquidity) => {
                        const allGroupItems = items.filter((i) => i.item_type === "liability" && i.liquidity === liquidity);
                        if (allGroupItems.length === 0) return null;
                        const groupKey = `liability-${liquidity}`;
                        const groupItems = getOrderedItems(allGroupItems, groupKey);
                        return (
                          <div key={groupKey} className="mb-2 border rounded-lg">
                            <button
                              onClick={() => toggleGroup(groupKey)}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                            >
                              <span className="font-medium capitalize">
                                {liquidity} ({groupItems.length})
                              </span>
                              <span>{expandedGroups[groupKey] ? "▼" : "▶"}</span>
                            </button>
                            {expandedGroups[groupKey] && (
                              <DndContext
                                collisionDetection={closestCenter}
                                onDragEnd={(e) => handleDragEnd(e, groupKey, groupItems)}
                              >
                                <SortableContext
                                  items={groupItems.map((i) => i.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div className="border-t px-3 py-2 space-y-2">
                                    {groupItems.map((item) => (
                                      <SortableItem
                                        key={item.id}
                                        item={item}
                                        groupKey={groupKey}
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                              </DndContext>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className={`mb-6 pt-4 border-t ${settingsTab !== "income" ? "hidden" : ""}`}>
                <h4 className="text-lg font-medium mb-3">
                  {editingIeId ? "Edit Income/Expense" : "Add Income/Expense"}
                </h4>
                <form onSubmit={handleSaveIe} className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={ieForm.ie_type}
                      onChange={(e) => handleIeChange("ie_type", e.target.value)}
                      className="px-3 py-2 border rounded-lg"
                    >
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name"
                      value={ieForm.name}
                      onChange={(e) => handleIeChange("name", e.target.value)}
                      className="px-3 py-2 border rounded-lg flex-1 min-w-[150px]"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={ieForm.frequency}
                      onChange={(e) => handleIeChange("frequency", e.target.value)}
                      className="px-3 py-2 border rounded-lg"
                    >
                      {FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Appreciation Rate (%)"
                      value={ieForm.appreciation_rate}
                      onChange={(e) => handleIeChange("appreciation_rate", e.target.value)}
                      className="px-3 py-2 border rounded-lg w-48"
                    />
                    {ieForm.appreciation_rate && (
                      <select
                        value={ieForm.appreciation_frequency}
                        onChange={(e) => handleIeChange("appreciation_frequency", e.target.value)}
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
                  <div className="flex flex-wrap gap-3">
                    <div className="flex gap-1 items-center">
                      <span className="text-sm text-gray-600">Start:</span>
                      <input
                        type="number"
                        placeholder="Month"
                        value={ieForm.start_month}
                        onChange={(e) => handleIeChange("start_month", e.target.value)}
                        className="px-2 py-1 border rounded-lg w-16"
                        min={1}
                        max={12}
                      />
                      <input
                        type="number"
                        placeholder="Year"
                        value={ieForm.start_year}
                        onChange={(e) => handleIeChange("start_year", e.target.value)}
                        className="px-2 py-1 border rounded-lg w-20"
                      />
                    </div>
                    <div className="flex gap-1 items-center">
                      <span className="text-sm text-gray-600">End:</span>
                      <input
                        type="number"
                        placeholder="Month"
                        value={ieForm.end_month}
                        onChange={(e) => handleIeChange("end_month", e.target.value)}
                        className="px-2 py-1 border rounded-lg w-16"
                        min={1}
                        max={12}
                      />
                      <input
                        type="number"
                        placeholder="Year"
                        value={ieForm.end_year}
                        onChange={(e) => handleIeChange("end_year", e.target.value)}
                        className="px-2 py-1 border rounded-lg w-20"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      {editingIeId ? "Update" : "Add"}
                    </button>
                    {editingIeId && (
                      <button
                        type="button"
                        onClick={handleCancelIeEdit}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className={`mb-6 ${settingsTab !== "income" ? "hidden" : ""}`}>
                <h4 className="text-lg font-medium mb-3">Defined Income/Expenses</h4>
                {incomeExpenses.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No income/expenses defined yet. Add your first one above.
                  </p>
                ) : (
                  <>
                    <div className="mb-4">
                      <h5 className="text-md font-semibold mb-2">Income</h5>
                      {incomeExpenses.filter((i) => i.ie_type === "income").map((ie) => (
                        <div key={ie.id} className="flex items-center justify-between px-3 py-2 border rounded mb-2">
                          <div>
                            <span className="font-medium">{ie.name}</span>
                            <span className="text-sm text-gray-500 ml-2">
                              ({FREQUENCY_OPTIONS.find((f) => f.value === ie.frequency)?.label})
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditIe(ie)} className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                            <button onClick={() => handleDeleteIe(ie.id)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h5 className="text-md font-semibold mb-2">Expenses</h5>
                      {incomeExpenses.filter((i) => i.ie_type === "expense").map((ie) => (
                        <div key={ie.id} className="flex items-center justify-between px-3 py-2 border rounded mb-2">
                          <div>
                            <span className="font-medium">{ie.name}</span>
                            <span className="text-sm text-gray-500 ml-2">
                              ({FREQUENCY_OPTIONS.find((f) => f.value === ie.frequency)?.label})
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditIe(ie)} className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                            <button onClick={() => handleDeleteIe(ie.id)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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

        {addMonthPopoverOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-80">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Add New Month</h3>
                <button
                  onClick={() => setAddMonthPopoverOpen(false)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Month
                </label>
                <input
                  type="month"
                  value={`${currentYear}-${currentMonth.padStart(2, "0")}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-");
                    setCurrentYear(y);
                    setCurrentMonth(m);
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copy values from
                </label>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="copyFrom"
                      value=""
                      checked={copyFromSnapshot === ""}
                      onChange={() => setCopyFromSnapshot("")}
                      className="mr-2"
                    />
                    <span>Empty month</span>
                  </label>
                  {sortedSnapshots.map((s) => (
                    <label
                      key={`${s.month}-${s.year}`}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="copyFrom"
                        value={`${s.month}-${s.year}`}
                        checked={copyFromSnapshot === `${s.month}-${s.year}`}
                        onChange={() => setCopyFromSnapshot(`${s.month}-${s.year}`)}
                        className="mr-2"
                      />
                      <span>{s.month}/{s.year}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAddMonthPopoverOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCreateMonth(parseInt(currentMonth), parseInt(currentYear), copyFromSnapshot)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Month
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}