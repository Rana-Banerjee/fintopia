"use client";

import { useState, useEffect } from "react";
import {
  getAssetsLiabilities,
  createAssetLiability,
  deleteAssetLiability,
  updateAssetLiability,
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
  generateMonths,
  AssetLiability,
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
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  applyEvent,
  regenerateAll,
  Event,
  EventImpact,
} from "@/lib/api";

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
  { value: "bi_monthly", label: "Bi-Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annual" },
  { value: "yearly", label: "Yearly" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "projection">("dashboard");
  const [items, setItems] = useState<AssetLiability[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chartSummaries, setChartSummaries] = useState<Summary[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

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
    associated_asset_id: "",
    interest_rate: "",
    emi_start_month: "",
    emi_start_year: "",
    emi_end_month: "",
    emi_end_year: "",
      is_fixed_emi: false,
      fixed_emi_amount: "",
      is_loan: false,
    });
  const [editingIeId, setEditingIeId] = useState<string | null>(null);
  const [ieValues, setIeValues] = useState<Record<string, number>>({});

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
  const [generateMonthOpen, setGenerateMonthOpen] = useState(false);
  const [sourceMonth, setSourceMonth] = useState<{ month: number; year: number } | null>(null);
  const [generateNumMonths, setGenerateNumMonths] = useState(1);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"assets" | "liabilities" | "income" | "regular_expenses" | "loans" | "events">("assets");
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("itemOrder");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });
  const [ieOrder, setIeOrder] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ieOrder");
      if (saved) return JSON.parse(saved);
    }
    return [];
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
    loans: true,
    events: true,
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [eventForm, setEventForm] = useState({
    name: "",
    is_recurring: false,
    start_month: "",
    start_year: "",
    frequency_months: "",
    duration: "1",
    impacts: [] as EventImpact[],
  });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
    loanLiabilities: true,
    netCash: true,
  });
  const [itemForm, setItemForm] = useState({
    name: "",
    item_type: "asset",
    liquidity: "liquid",
    appreciation_rate: "",
    appreciation_frequency: "monthly",
    start_month: "",
    start_year: "",
    end_month: "",
    end_year: "",
    loan_balance: "",
    interest_rate: "",
    emi_start_month: "",
    emi_start_year: "",
    emi_end_month: "",
    emi_end_year: "",
    fixed_emi_amount: "",
    associated_asset_id: "",
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [monthValues, setMonthValues] = useState<Record<string, number>>({});
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (settingsTab === "assets") {
      setEditingItemId(() => null);
      setItemForm(prev => ({ ...prev, item_type: "asset", liquidity: "liquid" }));
    } else if (settingsTab === "liabilities") {
      setEditingItemId(() => null);
      setItemForm(prev => ({ ...prev, item_type: "liability", liquidity: "fixed" }));
    } else if (settingsTab === "loans") {
      setEditingItemId(() => null);
      setItemForm(prev => ({ ...prev, item_type: "liability", liquidity: "fixed", loan_balance: "0", interest_rate: "", emi_start_month: "", emi_start_year: "", emi_end_month: "", emi_end_year: "", fixed_emi_amount: "" }));
    } else if (settingsTab === "income") {
      setEditingIeId(() => null);
      setIeForm(prev => ({ ...prev, ie_type: "income" }));
    } else if (settingsTab === "regular_expenses") {
      setEditingIeId(() => null);
      setIeForm(prev => ({ ...prev, ie_type: "expense" }));
    } else {
      setEditingItemId(() => null);
      setItemForm(prev => ({ ...prev, item_type: "asset", liquidity: "liquid" }));
    }
  }, [settingsTab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function fetchData(regenerate: boolean = false) {
    if (dashboardLoading) return;
    
    setDashboardLoading(true);
    try {
      if (regenerate) {
        await regenerateAll();
      }
      const [itemsData, snapshotsData, ieData, eventsData] = await Promise.all([
        getAssetsLiabilities(),
        getSnapshots(),
        getIncomeExpenses(),
        getEvents(),
      ]);
      setItems(itemsData);
      setSnapshots(snapshotsData);
      setIncomeExpenses(ieData);
      setEvents(eventsData);

      const summaries = await Promise.all(
        snapshotsData.map((s) => getSummary(s.month, s.year))
      );
      setChartSummaries(summaries);

      if (itemsData.length === 0 && !settingsOpen) {
        setSettingsOpen(true);
      }

      if (selectedMonthTab) {
        await loadMonthValues(selectedMonthTab.month, selectedMonthTab.year);
        loadIeValues(selectedMonthTab.month, selectedMonthTab.year);
      } else if (snapshotsData.length > 0) {
        setSelectedMonthTab(snapshotsData[0]);
      }
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadIeValues(month: number, year: number) {
    const values = await getIncomeExpenseValues(month, year);
    const valueMap: Record<string, number> = {};
    values.forEach((v) => {
      valueMap[v.item_id] = v.value;
    });
    setIeValues(valueMap);
  }

  async function loadMonthValues(month: number, year: number) {
    setDashboardLoading(true);
    try {
      const values = await getMonthValues(month, year);
      const valueMap: Record<string, number> = {};
      values.forEach((v) => {
        valueMap[v.item_id] = v.value;
      });

      if (Object.keys(valueMap).length === 0 && items.length > 0) {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevValues = await getMonthValues(prevMonth, prevYear);
        const prevValueMap: Record<string, number> = {};
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
    } finally {
      setDashboardLoading(false);
    }
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
    if (settingsTab === "loans") {
      if (!itemForm.interest_rate) {
        alert("Please enter the interest rate");
        return;
      }
      if (!itemForm.emi_start_month || !itemForm.emi_start_year || !itemForm.emi_end_month || !itemForm.emi_end_year) {
        alert("EMI start and end dates are required for loans");
        return;
      }
      const emiStartDate = new Date(parseInt(itemForm.emi_start_year), parseInt(itemForm.emi_start_month) - 1, 1);
      const now = new Date();
      now.setDate(1);
      if (emiStartDate <= now && !itemForm.fixed_emi_amount) {
        alert("Fixed EMI amount is required when EMI has already started");
        return;
      }
    }

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
      start_month: itemForm.start_month ? parseInt(itemForm.start_month) : null,
      start_year: itemForm.start_year ? parseInt(itemForm.start_year) : null,
      end_month: itemForm.end_month ? parseInt(itemForm.end_month) : null,
      end_year: itemForm.end_year ? parseInt(itemForm.end_year) : null,
      loan_balance: itemForm.loan_balance ? parseFloat(itemForm.loan_balance) : null,
      interest_rate: itemForm.interest_rate ? parseFloat(itemForm.interest_rate) : null,
      emi_start_month: itemForm.emi_start_month ? parseInt(itemForm.emi_start_month) : null,
      emi_start_year: itemForm.emi_start_year ? parseInt(itemForm.emi_start_year) : null,
      emi_end_month: itemForm.emi_end_month ? parseInt(itemForm.emi_end_month) : null,
      emi_end_year: itemForm.emi_end_year ? parseInt(itemForm.emi_end_year) : null,
      fixed_emi_amount: itemForm.fixed_emi_amount ? parseFloat(itemForm.fixed_emi_amount) : null,
      is_loan: settingsTab === "loans",
      associated_asset_id: itemForm.associated_asset_id ? itemForm.associated_asset_id : null,
    };

    if (editingItemId !== null) {
      await updateAssetLiability(editingItemId, payload);
      handleCancelItemEdit();
      fetchData(true);
    } else {
      await createAssetLiability(payload);
      fetchData(true);
      setItemForm({
        name: "",
        item_type: itemForm.item_type,
        liquidity: itemForm.liquidity,
        appreciation_rate: "",
        appreciation_frequency: "monthly",
        start_month: "",
        start_year: "",
        end_month: "",
        end_year: "",
        loan_balance: "",
        interest_rate: "",
        emi_start_month: "",
        emi_start_year: "",
        emi_end_month: "",
        emi_end_year: "",
        fixed_emi_amount: "",
        associated_asset_id: "",
      });
    }
    fetchData(true);
  }

  async function handleDeleteItem(id: string) {
    await deleteAssetLiability(id);
    fetchData(true);
  }

  function handleEditItem(item: AssetLiability) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      item_type: item.item_type,
      liquidity: item.liquidity || "liquid",
      appreciation_rate: item.appreciation_rate?.toString() || "",
      appreciation_frequency: item.appreciation_frequency || "monthly",
      start_month: item.start_month?.toString() || "",
      start_year: item.start_year?.toString() || "",
      end_month: item.end_month?.toString() || "",
      end_year: item.end_year?.toString() || "",
      loan_balance: item.loan_balance?.toString() || "",
      interest_rate: item.interest_rate?.toString() || "",
      emi_start_month: item.emi_start_month?.toString() || "",
      emi_start_year: item.emi_start_year?.toString() || "",
      emi_end_month: item.emi_end_month?.toString() || "",
      emi_end_year: item.emi_end_year?.toString() || "",
      fixed_emi_amount: item.fixed_emi_amount?.toString() || "",
      associated_asset_id: item.associated_asset_id || "",
    });
  }

  function handleCancelItemEdit() {
    setEditingItemId(null);
    const defaultType = settingsTab === "liabilities" ? "liability" : "asset";
    const defaultLiquidity = defaultType === "liability" ? "fixed" : "liquid";
    setItemForm({
      name: "",
      item_type: defaultType,
      liquidity: defaultLiquidity,
      appreciation_rate: "",
      appreciation_frequency: "monthly",
      start_month: "",
      start_year: "",
      end_month: "",
      end_year: "",
      loan_balance: "",
      interest_rate: "",
      emi_start_month: "",
      emi_start_year: "",
      emi_end_month: "",
      emi_end_year: "",
      fixed_emi_amount: "",
      associated_asset_id: "",
    });
  }

  function handleIeChange(field: string, value: string | boolean) {
    setIeForm({ ...ieForm, [field]: value });
  }

  async function handleSaveIe(e: React.FormEvent) {
    e.preventDefault();
    if (!ieForm.name) return;
    const isLoan = ieForm.interest_rate || ieForm.emi_start_month;
    if (ieForm.ie_type === "expense" && isLoan && !ieForm.interest_rate) {
      alert("Interest rate is required for loans.");
      return;
    }

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
      interest_rate: ieForm.interest_rate ? parseFloat(ieForm.interest_rate) : null,
      emi_start_month: ieForm.emi_start_month ? parseInt(ieForm.emi_start_month) : null,
      emi_start_year: ieForm.emi_start_year ? parseInt(ieForm.emi_start_year) : null,
      emi_end_month: ieForm.emi_end_month ? parseInt(ieForm.emi_end_month) : null,
      emi_end_year: ieForm.emi_end_year ? parseInt(ieForm.emi_end_year) : null,
      balance_disbursed: null,
      associated_asset_id: ieForm.associated_asset_id || null,
      is_fixed_emi: ieForm.is_fixed_emi,
      fixed_emi_amount: ieForm.fixed_emi_amount ? parseFloat(ieForm.fixed_emi_amount) : null,
      is_loan: ieForm.is_loan,
    };

    if (editingIeId !== null) {
      await updateIncomeExpense(editingIeId, payload);
      handleCancelIeEdit();
    } else {
      try {
        await createIncomeExpense(payload);
      } catch (err) {
        console.error("Failed to create income/expense:", err);
        alert("Failed to save. Check browser console for details.");
        return;
      }
      setIeForm({
        name: "",
        ie_type: ieForm.ie_type,
        frequency: "monthly",
        appreciation_rate: "",
        appreciation_frequency: "monthly",
        start_month: "",
        start_year: "",
        end_month: "",
        end_year: "",
        order: 0,
        interest_rate: "",
        emi_start_month: "",
        emi_start_year: "",
        emi_end_month: "",
        emi_end_year: "",
        associated_asset_id: "",
        is_fixed_emi: false,
        fixed_emi_amount: "",
        is_loan: false,
      });
    }
    fetchData(true);
  }

  async function handleDeleteIe(id: string) {
    await deleteIncomeExpense(id);
    fetchData(true);
  }

  async function handleEditIe(ie: IncomeExpense) {
    setEditingIeId(ie.id);
    setIeForm({
      name: ie.name,
      ie_type: ie.ie_type,
      frequency: ie.frequency,
      appreciation_rate: ie.appreciation_rate?.toString() || "",
      appreciation_frequency: ie.appreciation_frequency || "monthly",
      ...(ie.interest_rate ? { start_month: "", start_year: "", end_month: "", end_year: "" } : {
        start_month: ie.start_month?.toString() || "",
        start_year: ie.start_year?.toString() || "",
        end_month: ie.end_month?.toString() || "",
        end_year: ie.end_year?.toString() || "",
      }),
      order: ie.order,
      interest_rate: ie.interest_rate?.toString() || "",
      emi_start_month: ie.emi_start_month?.toString() || "",
      emi_start_year: ie.emi_start_year?.toString() || "",
      emi_end_month: ie.emi_end_month?.toString() || "",
      emi_end_year: ie.emi_end_year?.toString() || "",
      associated_asset_id: ie.associated_asset_id?.toString() || "",
      is_fixed_emi: ie.is_fixed_emi ?? false,
      fixed_emi_amount: ie.fixed_emi_amount?.toString() || "",
      is_loan: ie.is_loan,
    });
  }

  function handleCancelIeEdit() {
    setEditingIeId(null);
    const defaultIeType = settingsTab === "income" ? "income" : "expense";
    setIeForm({
      name: "",
      ie_type: defaultIeType,
      frequency: "monthly",
      appreciation_rate: "",
      appreciation_frequency: "monthly",
      start_month: "",
      start_year: "",
      end_month: "",
      end_year: "",
      order: 0,
      interest_rate: "",
      emi_start_month: "",
      emi_start_year: "",
      emi_end_month: "",
      emi_end_year: "",
      associated_asset_id: "",
      is_fixed_emi: false,
      fixed_emi_amount: "",
      is_loan: false,
    });
  }

  function handleValueChange(itemId: string, value: string) {
    setMonthValues({ ...monthValues, [itemId]: parseFloat(value) || 0 });
    setHasChanges(true);
  }

  function handleIeValueChange(itemId: string, value: string) {
    setIeValues({ ...ieValues, [itemId]: parseFloat(value) || 0 });
    setHasChanges(true);
  }

  function getTargetLabel(target_type: string, target_id: string): string {
    if (target_type === "asset" || target_type === "liability") {
      return items.find(i => i.id === target_id)?.name ?? target_id;
    }
    return incomeExpenses.find(i => i.id === target_id)?.name ?? target_id;
  }

  function getEventOccurrences(event: Event): [number, number][] {
    if (!event.is_recurring) {
      if (!event.start_month || !event.start_year) return [];
      return [[event.start_month, event.start_year]];
    }
    const occurrences: [number, number][] = [];
    let m: number = event.start_month ?? 1;
    let y: number = event.start_year ?? Number(currentYear);
    for (let i = 0; i < event.duration; i++) {
      occurrences.push([m, y]);
      m = m + (event.frequency_months ?? 1);
      while (m > 12) { m -= 12; y += 1; }
    }
    return occurrences;
  }

  function eventAppliesInMonth(event: Event, month: number, year: number): boolean {
    return getEventOccurrences(event).some(([m, y]) => m === month && y === year);
  }

  function startEditEvent(event: Event) {
    setEventForm({
      name: event.name,
      is_recurring: event.is_recurring,
      start_month: event.start_month != null ? String(event.start_month) : "",
      start_year: event.start_year != null ? String(event.start_year) : "",
      frequency_months: event.frequency_months != null ? String(event.frequency_months) : "",
      duration: String(event.duration),
      impacts: event.impacts.map(imp => ({ ...imp })),
    });
    setEditingEventId(event.id);
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: eventForm.name,
      is_recurring: eventForm.is_recurring,
      start_month: eventForm.start_month ? parseInt(eventForm.start_month) : null,
      start_year: eventForm.start_year ? parseInt(eventForm.start_year) : null,
      frequency_months: eventForm.frequency_months ? parseInt(eventForm.frequency_months) : null,
      duration: parseInt(eventForm.duration) || 1,
      impacts: eventForm.impacts.map(imp => ({
        ...imp,
        id: undefined,
      })),
    };
    if (editingEventId === "new") {
      await createEvent(payload as Omit<Event, "id">);
    } else if (editingEventId) {
      await updateEvent(editingEventId, payload as Omit<Event, "id">);
    }
    setEditingEventId(null);
    fetchData(true);
  }

  function isIeApplicable(frequency: string, month: number): boolean {
    if (frequency === "monthly") return true;
    if (frequency === "bi_monthly") return month % 2 === 0;
    if (frequency === "quarterly") return [1, 4, 7, 10].includes(month);
    if (frequency === "semi_annual") return [4, 10].includes(month);
    if (frequency === "yearly") return month === 4;
    return true;
  }

  async function handleSaveMonthValues() {
    if (!selectedMonthTab) return;
    const fullValues: Record<string, number> = { ...monthValues };
    orderedAssetItems.forEach(item => {
      if (fullValues[item.id] === undefined) {
        fullValues[item.id] = 0;
      }
    });
    orderedLiabilityItems.forEach(item => {
      if (fullValues[item.id] === undefined) {
        fullValues[item.id] = 0;
      }
    });
    loanAssets.forEach(loan => {
      if (fullValues[loan.id] === undefined) {
        fullValues[loan.id] = loan.loan_balance ?? 0;
      }
    });
    const ieValuesWithLoans = { ...ieValues };
    const loanIeItems = incomeExpenses.filter(i => i.is_loan);
    const month = selectedMonthTab.month;
    const year = selectedMonthTab.year;
    for (const ie of loanIeItems) {
      const loan = loanAssets.find(l => l.id === ie.associated_asset_id);
      if (!loan) continue;
      const phase = getLoanPhase(loan, month, year);
      if (phase === "ended") {
        ieValuesWithLoans[ie.id] = 0;
      } else if (phase === "active" && loan.fixed_emi_amount) {
        ieValuesWithLoans[ie.id] = loan.fixed_emi_amount;
      } else if (phase === "pre_emi" && loan.interest_rate) {
        const balance = monthValues[loan.id] ?? loan.loan_balance ?? 0;
        ieValuesWithLoans[ie.id] = Math.round(balance * loan.interest_rate / 1200);
      }
    }
    await Promise.all([
      saveMonthValues(selectedMonthTab.month, selectedMonthTab.year, fullValues),
      saveIncomeExpenseValues(selectedMonthTab.month, selectedMonthTab.year, ieValuesWithLoans),
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
    await fetchData(true);
    
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

  function getOrderedItems(groupItems: AssetLiability[], groupKey: string): AssetLiability[] {
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

  function getOrderedIeItems(ieItems: IncomeExpense[]): IncomeExpense[] {
    return [...ieItems].sort((a, b) => {
      const idxA = ieOrder.indexOf(a.id);
      const idxB = ieOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }

  function startAddIe(type: "income" | "expense", isLoan: boolean) {
    setEditingIeId(() => null);
    setIeForm({
      name: "",
      ie_type: type,
      frequency: "monthly",
      appreciation_rate: "",
      appreciation_frequency: "monthly",
      ...(isLoan
        ? { start_month: "", start_year: "", end_month: "", end_year: "" }
        : { start_month: "", start_year: "", end_month: "", end_year: "" }),
      order: 0,
      interest_rate: "",
      emi_start_month: "",
      emi_start_year: "",
      emi_end_month: "",
      emi_end_year: "",
      associated_asset_id: "",
      is_fixed_emi: false,
      fixed_emi_amount: "",
      is_loan: isLoan,
    });
  }

  function handleDragEnd(event: DragEndEvent, groupKey: string, groupItems: AssetLiability[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    let order = [...(itemOrder[groupKey] || [])];
    
    // Get current order based on items in this group
    const currentItemsOrder = groupItems.map(i => i.id);
    const hasAllItems = order.length === currentItemsOrder.length && currentItemsOrder.every(id => order.includes(id));
    
    if (hasAllItems && order.length > 0) {
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        order.splice(oldIndex, 1);
        order.splice(newIndex, 0, active.id as string);
      }
    } else {
      const oldIndex = currentItemsOrder.indexOf(active.id as string);
      const newIndex = currentItemsOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        order = [...currentItemsOrder];
        order.splice(oldIndex, 1);
        order.splice(newIndex, 0, active.id as string);
      }
    }
    
    const newItemOrder = { ...itemOrder, [groupKey]: order };
    setItemOrder(newItemOrder);
    localStorage.setItem("itemOrder", JSON.stringify(newItemOrder));
  }

  function handleIeDragEnd(event: DragEndEvent, ieItems: IncomeExpense[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ordered = [...ieItems].sort((a, b) => {
      const idxA = ieOrder.indexOf(a.id);
      const idxB = ieOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    const currentOrder = ordered.map(i => i.id);
    const hasAllItems = ieOrder.length === currentOrder.length &&
      currentOrder.every(id => ieOrder.includes(id));

    let newOrder: string[];
    if (hasAllItems && ieOrder.length > 0) {
      newOrder = [...ieOrder];
      const oldIndex = newOrder.indexOf(active.id as string);
      const newIndex = newOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, active.id as string);
      }
    } else {
      newOrder = [...currentOrder];
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, active.id as string);
      }
    }

    setIeOrder(newOrder);
    localStorage.setItem("ieOrder", JSON.stringify(newOrder));
  }

  function SortableItem({ item }: { item: AssetLiability }) {
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

  function SortableIeItem({ ie }: { ie: IncomeExpense }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: ie.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const loanIds = new Set(items.filter((i) => i.is_loan).map((i) => i.id));
    const isLoan = !!(ie.associated_asset_id && loanIds.has(ie.associated_asset_id));

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between ${isLoan ? "bg-purple-50 border border-purple-200 rounded px-3 py-2" : ""}`}
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
          <span>{ie.name}</span>
          <span className="text-xs text-gray-400">
            ({FREQUENCY_OPTIONS.find(f => f.value === ie.frequency)?.label})
          </span>
          {isLoan && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{ie.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleEditIe(ie)}
            className="text-blue-600 hover:text-blue-800 mr-3"
          >
            Edit
          </button>
          <button
            onClick={() => handleDeleteIe(ie.id)}
            className="text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  async function handleCreateMonth(month: number, year: number, copyFrom: string) {
    if (!snapshots.find((s) => s.month === month && s.year === year)) {
      const initialValues: Record<string, number> = {};
      const initialIeValues: Record<string, number> = {};
      
      if (copyFrom) {
        const [srcMonth, srcYear] = copyFrom.split("-").map(Number);
        const srcValues = await getMonthValues(srcMonth, srcYear);
        srcValues.forEach((v) => {
          initialValues[v.item_id] = v.value;
        });
        const srcIeValues = await getIncomeExpenseValues(srcMonth, srcYear);
        srcIeValues.forEach((v) => {
          initialIeValues[v.item_id] = v.value;
        });
      } else {
        [...orderedAssetItems, ...orderedLiabilityItems].forEach((item) => {
          initialValues[item.id] = 0;
        });
        incomeExpenses.forEach((item) => {
          initialIeValues[item.id] = 0;
        });
      }
      
      await saveMonthValues(month, year, initialValues);
      await saveIncomeExpenseValues(month, year, initialIeValues);
      await fetchData(true);
      setSelectedMonthTab({ month, year });
      setAddMonthPopoverOpen(false);
    }
  }

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
  const orderedLiabilityItems = getOrderedItemsByType("liability").filter(i => !i.is_loan);

  function getLoanPhase(loan: AssetLiability, month: number, year: number): "pre_emi" | "active" | "ended" {
    if (loan.emi_end_month && loan.emi_end_year) {
      const isEnded = (year > loan.emi_end_year) || (year === loan.emi_end_year && month > loan.emi_end_month);
      if (isEnded) return "ended";
    }
    const isFutureEmi = (year < loan.emi_start_year!) || (year === loan.emi_start_year! && month < loan.emi_start_month!);
    if (isFutureEmi && !loan.fixed_emi_amount) return "pre_emi";
    return "active";
  }

  const month = selectedMonthTab?.month ?? 1;
  const applicableIncome = incomeExpenses.filter(i => i.ie_type === "income" && isIeApplicable(i.frequency, month));
  const applicableExpenses = incomeExpenses.filter(i => i.ie_type === "expense" && isIeApplicable(i.frequency, month) && !i.is_loan);
  const incomeSum = applicableIncome.reduce((sum, ie) => sum + Math.round(ieValues[ie.id] ?? 0), 0);
  const expenseSum = applicableExpenses.reduce((sum, ie) => sum + Math.round(ieValues[ie.id] ?? 0), 0);
  const assetsTotal = orderedAssetItems.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);
  const liabilitiesTotal = orderedLiabilityItems.reduce((sum, item) => sum + (monthValues[item.id] ?? 0), 0);

  const loanAssets = items.filter(i => i.is_loan);
  const visibleLoans = loanAssets.filter(loan => {
    const phase = getLoanPhase(loan, month, selectedMonthTab?.year ?? 2026);
    return phase !== "ended";
  });
  const loansTotal = visibleLoans.reduce((sum, loan) => sum + Math.round(monthValues[loan.id] ?? loan.loan_balance ?? 0), 0);
  const totalEmiExpense = visibleLoans.reduce((sum, loan) => {
    const phase = getLoanPhase(loan, month, selectedMonthTab?.year ?? 2026);
    const outstanding = monthValues[loan.id] ?? loan.loan_balance ?? 0;
    if (phase === "active" && loan.fixed_emi_amount) {
      return sum + loan.fixed_emi_amount;
    } else if (phase === "pre_emi" && loan.interest_rate) {
      return sum + Math.round(outstanding * loan.interest_rate / 1200);
    }
    return sum;
  }, 0);

  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  const chartData = snapshots.map((s, idx) => {
    const summary = chartSummaries[idx];
    const totalAssets = (summary?.current_assets ?? 0) + (summary?.semi_liquid_assets ?? 0) + (summary?.retirement_assets ?? 0) + (summary?.property_assets ?? 0);
    const totalLiabilities = (summary?.liquid_liabilities ?? 0) + (summary?.fixed_liabilities ?? 0) + (summary?.loan_liabilities ?? 0);
    return {
      name: `${s.month}/${s.year}`,
      currentAssets: summary?.current_assets ?? 0,
      semiLiquidAssets: summary?.semi_liquid_assets ?? 0,
      retirementAssets: summary?.retirement_assets ?? 0,
      propertyAssets: summary?.property_assets ?? 0,
      totalAssets,
      liquidLiabilities: summary?.liquid_liabilities ?? 0,
      fixedLiabilities: summary?.fixed_liabilities ?? 0,
      loanLiabilities: summary?.loan_liabilities ?? 0,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      netCash: (summary?.current_assets ?? 0) + (summary?.semi_liquid_assets ?? 0) - (summary?.liquid_liabilities ?? 0),
    };
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
            {dashboardLoading && (
              <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                  <div className="text-lg font-semibold text-gray-700">Loading...</div>
                </div>
              </div>
            )}
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
                            {visibleLines.loanLiabilities && <Line type="monotone" dataKey="loanLiabilities" name="Loan Liabilities" stroke="#a855f7" strokeWidth={2} />}
                            {visibleLines.netCash && <Line type="monotone" dataKey="netCash" name="Net Cash" stroke="#64748b" strokeWidth={2} />}
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
              <button
                onClick={() => setGenerateMonthOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Generate Month
              </button>
              <button
                onClick={() => {
                  setEventForm({
                    name: "",
                    is_recurring: false,
                    start_month: String(currentMonth),
                    start_year: String(currentYear),
                    frequency_months: "",
                    duration: "1",
                    impacts: [],
                  });
                  setEditingEventId("new");
                  setSettingsTab("events");
                  setSettingsOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                Add Event
              </button>
              {hasChanges && !dashboardLoading && (
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

            {events.length > 0 && (
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-center mb-3 pb-2 border-b">
                  <h2 className="text-lg font-semibold text-amber-600">Events</h2>
                  <button
                    onClick={() => {
                      setEventForm({
                        name: "",
                        is_recurring: false,
                        start_month: String(currentMonth),
                        start_year: String(currentYear),
                        frequency_months: "",
                        duration: "1",
                        impacts: [],
                      });
                      setEditingEventId("new");
                      setSettingsTab("events");
                      setSettingsOpen(true);
                    }}
                    className="px-3 py-1 text-sm bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                  >
                    + Add Event
                  </button>
                </div>
                <div className="space-y-2">
                  {events.map(event => (
                    <div key={event.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-amber-800">{event.name}</h4>
                          <p className="text-xs text-amber-600">
                            {event.start_month}/{event.start_year} · {" "}
                            {event.is_recurring
                              ? `Every ${event.frequency_months}mo × ${event.duration}`
                              : "One-time"}
                          </p>
                          {event.impacts.length > 0 && (
                            <ul className="mt-1 text-xs text-amber-700">
                              {event.impacts.map((imp, idx) => (
                                <li key={idx}>
                                  {imp.is_additive ? "+" : "-"}{imp.amount.toLocaleString('en-IN')} {imp.target_type}/{getTargetLabel(imp.target_type, imp.target_id)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={async () => {
                              await applyEvent(event.id);
                              fetchData(true);
                            }}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => {
                              startEditEvent(event);
                              setSettingsTab("events");
                              setSettingsOpen(true);
                            }}
                            className="px-2 py-1 text-xs bg-amber-200 text-amber-800 rounded hover:bg-amber-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm("Delete this event? All future months will be recalculated.")) {
                                await deleteEvent(event.id);
                                fetchData(true);
                              }
                            }}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      onClick={() => {
                        if (dashboardLoading) return;
                        setSelectedMonthTab(s);
                      }}
                      className={`px-2 py-1 ${dashboardLoading ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={dashboardLoading}
                    >
                      {s.month}/{s.year}
                    </button>
                    <button
                      onClick={() => {
                        if (dashboardLoading) return;
                        handleDeleteSnapshot(s.month, s.year);
                      }}
                      className={`text-xs hover:text-red-500 ${dashboardLoading ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={dashboardLoading}
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
                        (summary?.fixed_liabilities ?? 0) -
                        (summary?.loan_liabilities ?? 0)
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
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <h2 className="text-lg font-semibold text-green-600">Assets</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-green-600">₹{assetsTotal.toLocaleString('en-IN')}</span>
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
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <h2 className="text-lg font-semibold text-red-600">Liabilities</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-red-600">₹{(liabilitiesTotal + loansTotal).toLocaleString('en-IN')}</span>
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
                    {visibleLoans.length > 0 && (
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-200">
                          <button
                            onClick={() => toggleSection("loans")}
                            className="flex items-center gap-2"
                          >
                            <span className="text-gray-400">{expandedSections.loans ? "▼" : "▶"}</span>
                            <h3 className="text-md font-semibold text-purple-700">Loans</h3>
                          </button>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-purple-600">
                              Liability: <span className="font-medium">₹{loansTotal.toLocaleString('en-IN')}</span>
                            </span>
                            <span className="text-sm text-purple-600">
                              EMI: <span className="font-medium">₹{totalEmiExpense.toLocaleString('en-IN')}/mo</span>
                            </span>
                          </div>
                        </div>
                        {expandedSections.loans && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-purple-600 text-xs border-b border-purple-200">
                                <th className="pb-1 font-medium">Name</th>
                                <th className="pb-1 font-medium text-right">Balance</th>
                                <th className="pb-1 font-medium text-right">EMI</th>
                                <th className="pb-1 font-medium text-right">Phase</th>
                              </tr>
                            </thead>
                            <tbody>
                            {visibleLoans.map(loan => {
                              const phase = getLoanPhase(loan, month, selectedMonthTab?.year ?? 2026);
                              const outstanding = monthValues[loan.id] ?? loan.loan_balance ?? 0;
                              const emi = (phase === "active" && loan.fixed_emi_amount)
                                ? loan.fixed_emi_amount
                                : (phase === "pre_emi" && loan.interest_rate)
                                  ? Math.round(outstanding * loan.interest_rate / 1200)
                                  : 0;
                              return (
                                <tr key={loan.id} className="border-b border-purple-100 last:border-b-0">
                                  <td className="py-1.5 font-medium text-gray-700">{loan.name}</td>
                                  <td className="py-1.5 text-right">
                                    <input
                                      type="number"
                                      value={monthValues[loan.id] ?? ""}
                                      placeholder={(loan.loan_balance ?? 0).toString()}
                                      onChange={e => handleValueChange(loan.id, e.target.value)}
                                      className="w-32 px-2 py-0.5 border rounded text-right text-sm"
                                    />
                                  </td>
                                  <td className="py-1.5 text-right text-gray-600">
                                    {emi > 0 ? `₹${emi.toLocaleString('en-IN')}` : "—"}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      phase === "pre_emi" ? "bg-amber-100 text-amber-700" :
                                      phase === "active" ? "bg-green-100 text-green-700" :
                                      "bg-gray-100 text-gray-500"
                                    }`}>
                                      {phase === "pre_emi" ? "Pre-EMI" : phase === "active" ? "Active" : phase}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <button
                        onClick={() => toggleSection("income")}
                        className="flex items-center gap-2 text-lg font-semibold"
                      >
                        <span>{expandedSections.income ? "▼" : "▶"}</span>
                        <span className="text-green-600">Income</span>
                      </button>
                      <span className="text-lg font-bold text-green-600">₹{incomeSum.toLocaleString('en-IN')}</span>
                    </div>
                    {expandedSections.income && (
                      <div className="space-y-2">
                        {(() => {
                          const filtered = incomeExpenses.filter(i => i.ie_type === "income" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1));
                          return filtered.map(ie => (
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
                          ));
                        })()}
                        {incomeExpenses.filter(i => i.ie_type === "income" && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1)).length === 0 && (
                          <p className="text-sm text-gray-500">No income items defined. Add in Settings.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b">
                      <button
                        onClick={() => toggleSection("expenses")}
                        className="flex items-center gap-2 text-lg font-semibold"
                      >
                        <span>{expandedSections.expenses ? "▼" : "▶"}</span>
                        <span className="text-red-600">Expenses</span>
                      </button>
                      <span className="text-lg font-bold text-red-600">₹{expenseSum.toLocaleString('en-IN')}</span>
                    </div>
                    {expandedSections.expenses && (
                      <div className="space-y-2">
                        {(() => {
                          const filtered = incomeExpenses.filter(i => i.ie_type === "expense" && !i.is_loan && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1));
                          return filtered.map(ie => (
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
                          ));
                        })()}
                        {incomeExpenses.filter(i => i.ie_type === "expense" && !i.is_loan && isIeApplicable(i.frequency, selectedMonthTab?.month ?? 1)).length === 0 && (
                          <p className="text-sm text-gray-500">No regular expense items. Add in Settings.</p>
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

              <div className="flex border-b mb-4 overflow-x-auto">
                {(["assets", "liabilities", "income", "regular_expenses", "loans", "events"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className={`px-4 py-2 font-medium whitespace-nowrap ${
                      settingsTab === tab
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "regular_expenses" ? "Regular Expenses" :
                     tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {settingsTab === "assets" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-lg font-medium">Assets</h4>
                    <button
                      onClick={() => {
                        setEditingItemId(null);
                        setItemForm({ name: "", item_type: "asset", liquidity: "liquid", appreciation_rate: "", appreciation_frequency: "monthly", start_month: "", start_year: "", end_month: "", end_year: "", loan_balance: "", interest_rate: "", emi_start_month: "", emi_start_year: "", emi_end_month: "", emi_end_year: "", fixed_emi_amount: "", associated_asset_id: "" });
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      + Add Asset
                    </button>
                  </div>
                  <form onSubmit={handleSaveItem} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="text"
                        placeholder="Name"
                        value={itemForm.name}
                        onChange={(e) => handleItemChange("name", e.target.value)}
                        className="px-3 py-2 border rounded-lg flex-1 min-w-[150px]"
                      />
                      <select
                        value={itemForm.liquidity}
                        onChange={(e) => handleItemChange("liquidity", e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      >
                        {LIQUIDITY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="number"
                        placeholder="Appreciation Rate (%)"
                        value={itemForm.appreciation_rate}
                        onChange={(e) => handleItemChange("appreciation_rate", e.target.value)}
                        className="px-3 py-2 border rounded-lg w-48"
                      />
                      {itemForm.appreciation_rate && (
                        <select
                          value={itemForm.appreciation_frequency}
                          onChange={(e) => handleItemChange("appreciation_frequency", e.target.value)}
                          className="px-3 py-2 border rounded-lg"
                        >
                          {APPRECIATION_FREQUENCIES.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingItemId ? "Update" : "Add"}
                      </button>
                      {editingItemId && (
                        <button type="button" onClick={handleCancelItemEdit} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
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
                          <span className="font-medium capitalize">{liquidity.replace("-", " ")} ({groupItems.length})</span>
                          <span>{expandedGroups[groupKey] ? "▼" : "▶"}</span>
                        </button>
                        {expandedGroups[groupKey] && (
                          <DndContext collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, groupKey, groupItems)}>
                            <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                              <div className="border-t px-3 py-2 space-y-2">
                                {groupItems.map((item) => (
                                      <SortableItem
                                        key={item.id}
                                        item={item}
                                      />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    );
                  })}
                  {items.filter((i) => i.item_type === "asset").length === 0 && (
                    <p className="text-gray-500 text-center py-4">No assets yet. Add one above.</p>
                  )}
                </div>
              )}

              {settingsTab === "liabilities" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-lg font-medium">Liabilities</h4>
                    <button
                      onClick={() => {
                        setEditingItemId(null);
                        setItemForm({ name: "", item_type: "liability", liquidity: "fixed", appreciation_rate: "", appreciation_frequency: "monthly", start_month: "", start_year: "", end_month: "", end_year: "", loan_balance: "", interest_rate: "", emi_start_month: "", emi_start_year: "", emi_end_month: "", emi_end_year: "", fixed_emi_amount: "", associated_asset_id: "" });
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      + Add Liability
                    </button>
                  </div>
                  <form onSubmit={handleSaveItem} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="text"
                        placeholder="Name"
                        value={itemForm.name}
                        onChange={(e) => handleItemChange("name", e.target.value)}
                        className="px-3 py-2 border rounded-lg flex-1 min-w-[150px]"
                      />
                      <select
                        value={itemForm.liquidity}
                        onChange={(e) => handleItemChange("liquidity", e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      >
                        {LIABILITY_LIQUIDITY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingItemId ? "Update" : "Add"}
                      </button>
                      {editingItemId && (
                        <button type="button" onClick={handleCancelItemEdit} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                  {(["liquid", "fixed"] as const).map((liquidity) => {
                    const allGroupItems = items.filter((i) => i.item_type === "liability" && i.liquidity === liquidity && !i.is_loan);
                    if (allGroupItems.length === 0) return null;
                    const groupKey = `liability-${liquidity}`;
                    const groupItems = getOrderedItems(allGroupItems, groupKey);
                    return (
                      <div key={groupKey} className="mb-2 border rounded-lg">
                        <button
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                        >
                          <span className="font-medium capitalize">{liquidity} ({groupItems.length})</span>
                          <span>{expandedGroups[groupKey] ? "▼" : "▶"}</span>
                        </button>
                        {expandedGroups[groupKey] && (
                          <DndContext collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, groupKey, groupItems)}>
                            <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                              <div className="border-t px-3 py-2 space-y-2">
                                {groupItems.map((item) => (
                                      <SortableItem
                                        key={item.id}
                                        item={item}
                                      />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    );
                  })}
                  {items.filter((i) => i.item_type === "liability" && !i.is_loan).length === 0 && (
                    <p className="text-gray-500 text-center py-4">No liabilities yet. Add one above.</p>
                  )}
                </div>
              )}

              {settingsTab === "income" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-lg font-medium">Income</h4>
                    <button
                      onClick={() => startAddIe("income", false)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      + Add Income
                    </button>
                  </div>
                  <form onSubmit={handleSaveIe} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      placeholder="Name"
                      value={ieForm.name}
                      onChange={(e) => handleIeChange("name", e.target.value)}
                      className="px-3 py-2 border rounded-lg w-full"
                    />
                    <div className="flex flex-wrap gap-3">
                      <select
                        value={ieForm.frequency}
                        onChange={(e) => handleIeChange("frequency", e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      >
                        {FREQUENCY_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
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
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex gap-1 items-center flex-wrap">
                      <span className="text-sm text-gray-600 mr-2">Valid period:</span>
                      <input type="number" placeholder="From M" value={ieForm.start_month} onChange={(e) => handleIeChange("start_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={ieForm.start_year} onChange={(e) => handleIeChange("start_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                      <span className="text-gray-400 mx-1">to</span>
                      <input type="number" placeholder="M" value={ieForm.end_month} onChange={(e) => handleIeChange("end_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={ieForm.end_year} onChange={(e) => handleIeChange("end_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingIeId ? "Update" : "Add"}
                      </button>
                      {editingIeId && (
                        <button type="button" onClick={handleCancelIeEdit} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                  {(() => {
                    const incomeItems = incomeExpenses.filter((i) => i.ie_type === "income");
                    const ordered = getOrderedIeItems(incomeItems);
                    if (ordered.length === 0) return <p className="text-gray-500 text-center py-4">No income items yet. Add one above.</p>;
                    return (
                      <DndContext collisionDetection={closestCenter} onDragEnd={(e) => handleIeDragEnd(e, ordered)}>
                        <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {ordered.map((ie) => (
                              <div key={ie.id} className="border rounded-lg p-3">
                                <SortableIeItem ie={ie} />
                              </div>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    );
                  })()}
                </div>
              )}

              {settingsTab === "regular_expenses" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-lg font-medium">Regular Expenses</h4>
                    <button
                      onClick={() => startAddIe("expense", false)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      + Add Expense
                    </button>
                  </div>
                  <form onSubmit={handleSaveIe} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      placeholder="Name"
                      value={ieForm.name}
                      onChange={(e) => handleIeChange("name", e.target.value)}
                      className="px-3 py-2 border rounded-lg w-full"
                    />
                    <div className="flex flex-wrap gap-3">
                      <select
                        value={ieForm.frequency}
                        onChange={(e) => handleIeChange("frequency", e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      >
                        {FREQUENCY_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
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
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex gap-1 items-center flex-wrap">
                      <span className="text-sm text-gray-600 mr-2">Valid period:</span>
                      <input type="number" placeholder="From M" value={ieForm.start_month} onChange={(e) => handleIeChange("start_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={ieForm.start_year} onChange={(e) => handleIeChange("start_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                      <span className="text-gray-400 mx-1">to</span>
                      <input type="number" placeholder="M" value={ieForm.end_month} onChange={(e) => handleIeChange("end_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={ieForm.end_year} onChange={(e) => handleIeChange("end_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingIeId ? "Update" : "Add"}
                      </button>
                      {editingIeId && (
                        <button type="button" onClick={handleCancelIeEdit} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                  {(() => {
                    const regularExpenses = incomeExpenses.filter((i) => i.ie_type === "expense" && !i.is_loan);
                    const ordered = getOrderedIeItems(regularExpenses);
                    if (ordered.length === 0) return <p className="text-gray-500 text-center py-4">No regular expenses yet. Add one above.</p>;
                    return (
                      <DndContext collisionDetection={closestCenter} onDragEnd={(e) => handleIeDragEnd(e, ordered)}>
                        <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {ordered.map((ie) => (
                              <div key={ie.id} className="border rounded-lg p-3">
                                <SortableIeItem ie={ie} />
                              </div>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    );
                  })()}
                </div>
              )}

              {settingsTab === "loans" && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-lg font-medium">Loans</h4>
                    <button
                      onClick={() => {
                        setEditingItemId(null);
                        setItemForm({ name: "", item_type: "liability", liquidity: "fixed", appreciation_rate: "", appreciation_frequency: "monthly", start_month: "", start_year: "", end_month: "", end_year: "", loan_balance: "0", interest_rate: "", emi_start_month: "", emi_start_year: "", emi_end_month: "", emi_end_year: "", fixed_emi_amount: "", associated_asset_id: "" });
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      + Add Loan
                    </button>
                  </div>
                  <form onSubmit={handleSaveItem} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="text"
                        placeholder="Loan Name"
                        value={itemForm.name}
                        onChange={(e) => handleItemChange("name", e.target.value)}
                        className="px-3 py-2 border rounded-lg flex-1 min-w-[150px]"
                      />
                      <input
                        type="number"
                        placeholder="Loan Balance"
                        value={itemForm.loan_balance}
                        onChange={(e) => handleItemChange("loan_balance", e.target.value)}
                        className="px-3 py-2 border rounded-lg w-40"
                      />
                      <input
                        type="number"
                        placeholder="Interest Rate (%)"
                        value={itemForm.interest_rate}
                        onChange={(e) => handleItemChange("interest_rate", e.target.value)}
                        className="px-3 py-2 border rounded-lg w-40"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                      <span className="text-sm text-gray-600">EMI Period:</span>
                      <input type="number" placeholder="From M" value={itemForm.emi_start_month} onChange={(e) => handleItemChange("emi_start_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={itemForm.emi_start_year} onChange={(e) => handleItemChange("emi_start_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                      <span className="text-gray-400 mx-1">to</span>
                      <input type="number" placeholder="M" value={itemForm.emi_end_month} onChange={(e) => handleItemChange("emi_end_month", e.target.value)} className="px-2 py-1 border rounded-lg w-16" min={1} max={12} />
                      <input type="number" placeholder="Y" value={itemForm.emi_end_year} onChange={(e) => handleItemChange("emi_end_year", e.target.value)} className="px-2 py-1 border rounded-lg w-20" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="number"
                        placeholder="Fixed EMI Amount (optional)"
                        value={itemForm.fixed_emi_amount}
                        onChange={(e) => handleItemChange("fixed_emi_amount", e.target.value)}
                        className="px-3 py-2 border rounded-lg w-48"
                      />
                      <select
                        value={itemForm.associated_asset_id}
                        onChange={(e) => handleItemChange("associated_asset_id", e.target.value)}
                        className="px-3 py-2 border rounded-lg w-48"
                      >
                        <option value="">Deduct EMI from asset (optional)</option>
                        {items.filter((i) => i.item_type === "asset" && i.liquidity === "liquid" && !i.is_loan && i.id !== editingItemId).map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {editingItemId ? "Update" : "Add"}
                      </button>
                      {editingItemId && (
                        <button type="button" onClick={handleCancelItemEdit} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                  {(() => {
                    const loanItems = items.filter((i) => i.is_loan);
                    if (loanItems.length === 0) return <p className="text-gray-500 text-center py-4">No loans yet. Add one above.</p>;
                    return (
                      <div className="space-y-2">
                        {loanItems.map((loan) => {
                          const phase = loan.emi_start_year
                            ? (loan.emi_end_year ? "Active (scheduled)" : "Active")
                            : "No EMI";
                          return (
                            <div key={loan.id} className="border rounded-lg p-3 flex justify-between items-center">
                              <div>
                                <span className="font-medium">{loan.name}</span>
                                <span className="ml-2 text-sm text-gray-500">₹{loan.loan_balance?.toLocaleString('en-IN') ?? 0}</span>
                                {loan.interest_rate && <span className="ml-2 text-sm text-gray-500">@{loan.interest_rate}%</span>}
                                <span className="ml-2 text-xs text-purple-600">{phase}</span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditItem(loan)}
                                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={async () => {
                                    await deleteAssetLiability(loan.id);
                                    fetchData(true);
                                  }}
                                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {settingsTab === "events" && (
                <div>
                  {!editingEventId ? (
                    <div>
                      <button
                        onClick={() => {
                          setEventForm({
                            name: "",
                            is_recurring: false,
                            start_month: String(currentMonth),
                            start_year: String(currentYear),
                            frequency_months: "",
                            duration: "1",
                            impacts: [],
                          });
                          setEditingEventId("new");
                        }}
                        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        + Add Event
                      </button>
                      {events.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No events yet. Add one to get started.</p>
                      ) : (
                        <div className="space-y-3">
                          {events.map((event) => (
                            <div key={event.id} className="border rounded-lg p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-semibold">{event.name}</h4>
                                  <p className="text-sm text-gray-600">
                                    {event.is_recurring
                                      ? `Recurring: ${event.start_month}/${event.start_year} every ${event.frequency_months}mo × ${event.duration} times`
                                      : `One-time: ${event.start_month}/${event.start_year}`}
                                  </p>
                                  {event.impacts.length > 0 && (
                                    <ul className="mt-2 text-sm text-gray-700">
                                      {event.impacts.map((imp) => (
                                        <li key={imp.id}>
                                          {imp.is_additive ? "+" : "-"}{imp.amount} on {imp.target_type}/{getTargetLabel(imp.target_type, imp.target_id)}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => startEditEvent(event)}
                                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm("Delete this event?")) {
                                        await deleteEvent(event.id);
                                        fetchData(true);
                                      }
                                    }}
                                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSaveEvent} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                        <input
                          type="text"
                          value={eventForm.name}
                          onChange={(e) => setEventForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={eventForm.is_recurring}
                            onChange={(e) => setEventForm(f => ({ ...f, is_recurring: e.target.checked }))}
                          />
                          <span className="text-sm font-medium">Recurring Event</span>
                        </label>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={eventForm.start_month}
                            onChange={(e) => setEventForm(f => ({ ...f, start_month: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Year</label>
                          <input
                            type="number"
                            value={eventForm.start_year}
                            onChange={(e) => setEventForm(f => ({ ...f, start_year: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                          />
                        </div>
                        {eventForm.is_recurring && (
                          <>
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Every (months)</label>
                              <input
                                type="number"
                                min="1"
                                value={eventForm.frequency_months}
                                onChange={(e) => setEventForm(f => ({ ...f, frequency_months: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (times)</label>
                              <input
                                type="number"
                                min="1"
                                value={eventForm.duration}
                                onChange={(e) => setEventForm(f => ({ ...f, duration: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg"
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-800 mb-2">Impacts</h4>
                        {eventForm.impacts.map((imp, idx) => (
                          <div key={idx} className="flex gap-2 mb-2 items-center">
                            <select
                              value={imp.target_type}
                              onChange={(e) => {
                                const updated = [...eventForm.impacts];
                                updated[idx] = { ...updated[idx], target_type: e.target.value, target_id: "" };
                                setEventForm(f => ({ ...f, impacts: updated }));
                              }}
                              className="px-2 py-1 border rounded-lg text-sm"
                            >
                              <option value="">Select type</option>
                              <option value="asset">Asset</option>
                              <option value="liability">Liability</option>
                              <option value="income">Income</option>
                              <option value="expense">Expense</option>
                              <option value="loan_balance">Loan Balance</option>
                              <option value="loan_emi">Loan EMI</option>
                            </select>
                            <select
                              value={imp.target_id}
                              onChange={(e) => {
                                const updated = [...eventForm.impacts];
                                updated[idx] = { ...updated[idx], target_id: e.target.value };
                                setEventForm(f => ({ ...f, impacts: updated }));
                              }}
                              className="px-2 py-1 border rounded-lg text-sm flex-1"
                            >
                              <option value="">Select target</option>
                              {imp.target_type === "asset" && items.filter(i => i.item_type === "asset").map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                              {imp.target_type === "liability" && items.filter(i => i.item_type === "liability").map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                              {imp.target_type === "income" && incomeExpenses.filter(i => i.ie_type === "income").map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                              {imp.target_type === "expense" && incomeExpenses.filter(i => i.ie_type === "expense" && !i.is_loan).map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                              {(imp.target_type === "loan_balance" || imp.target_type === "loan_emi") && incomeExpenses.filter(i => i.is_loan).map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              placeholder="Amount"
                              value={imp.amount}
                              onChange={(e) => {
                                const updated = [...eventForm.impacts];
                                updated[idx] = { ...updated[idx], amount: parseFloat(e.target.value) || 0 };
                                setEventForm(f => ({ ...f, impacts: updated }));
                              }}
                              className="px-2 py-1 border rounded-lg w-28"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...eventForm.impacts];
                                updated[idx] = { ...updated[idx], is_additive: !updated[idx].is_additive };
                                setEventForm(f => ({ ...f, impacts: updated }));
                              }}
                              className={`px-2 py-1 text-xs rounded ${imp.is_additive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                              title={imp.is_additive ? "Additive (adds value)" : "Deductive (reduces value)"}
                            >
                              {imp.is_additive ? "Add" : "Deduct"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = eventForm.impacts.filter((_, i) => i !== idx);
                                setEventForm(f => ({ ...f, impacts: updated }));
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setEventForm(f => ({
                              ...f,
                              impacts: [...f.impacts, { target_type: "", target_id: "", amount: 0, is_additive: true }],
                            }));
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          + Add Impact
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          {editingEventId === "new" ? "Create Event" : "Update Event"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEventId(null)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

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

        {generateMonthOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-80">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Generate Month</h3>
                <button
                  onClick={() => setGenerateMonthOpen(false)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Month
                </label>
                <select
                  value={sourceMonth ? `${sourceMonth.month}-${sourceMonth.year}` : ""}
                  onChange={(e) => {
                    const [m, y] = e.target.value.split("-").map(Number);
                    setSourceMonth({ month: m, year: y });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select a month</option>
                  {snapshots.map((s) => (
                    <option key={`${s.month}-${s.year}`} value={`${s.month}-${s.year}`}>
                      {s.month}/{s.year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Months (1-12)
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={generateNumMonths}
                  onChange={(e) => setGenerateNumMonths(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="mb-4 text-sm text-gray-500">
                Note: Income and expenses linked to assets will auto-adjust the asset value.
              </div>
              {sourceMonth && (
                <div className="mb-4 text-sm text-gray-600">
                  Will generate:{" "}
                  {(() => {
                    const months: string[] = [];
                    let m = sourceMonth.month;
                    let y = sourceMonth.year;
                    for (let i = 0; i < generateNumMonths; i++) {
                      m = m + 1;
                      if (m > 12) { m = 1; y = y + 1; }
                      months.push(`${m}/${y}`);
                    }
                    return months.join(", ");
                  })()}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setGenerateMonthOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!sourceMonth) return;
                    const generated = await generateMonths(sourceMonth.month, sourceMonth.year, generateNumMonths);
                    await fetchData(true);
                    if (generated.length > 0) {
                      setSelectedMonthTab({ month: generated[0].month, year: generated[0].year });
                    }
                    setGenerateMonthOpen(false);
                  }}
                  disabled={!sourceMonth}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}