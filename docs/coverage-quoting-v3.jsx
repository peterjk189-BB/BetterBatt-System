import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import {
  LayoutDashboard, Building2, Users, Package, ClipboardList, HardHat,
  FileBarChart, Plus, X, Pencil, Trash2, Loader2, Zap, ListChecks,
  Download, Printer, Wallet, FileText, Upload, Calendar, ChevronLeft, ChevronRight, Truck, ShoppingCart, Search,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import * as XLSX from "xlsx";

// ---------- Design tokens ----------
const C = {
  paper: "#EEEFE9", paperAlt: "#E4E6DC", ink: "#1C231F", inkSoft: "#57614F",
  line: "#D4D6C7", card: "#F7F7F2", accent: "#2C4A5E", accentSoft: "#DCE4E6",
  amber: "#B9812C", amberSoft: "#F1E4C8", green: "#4B7A55", greenSoft: "#DCE8DE",
  rust: "#AD4A2C", rustSoft: "#F1DAD1", sidebar: "#1C231F", sidebarSoft: "#8FA090", sidebarText: "#F1F1EA",
};
const OUTCOME_STYLES = {
  Open: { bg: C.accentSoft, fg: C.accent }, Accepted: { bg: C.greenSoft, fg: C.green },
  Lost: { bg: C.rustSoft, fg: C.rust }, Cancelled: { bg: C.paperAlt, fg: C.inkSoft },
};

let idSeq = 0;
const uid = (p) => { idSeq += 1; return `${p}-${Date.now().toString(36)}-${idSeq}`; };
const fmtCurrency = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n || 0);
const fmtPct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
const fmtQuoteNo = (n) => (n ? `Q${n}` : "—");
const fmtDMY = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

// ---------- Seed data ----------
const seedParts = [
  { id: "pt1", name: "R6.0 Gold Ceiling Batts 1160x580", supplier: "Bradford", coverage: 4.5, packCostEx: 41.61, installerRate: 1.5, supplyChargePerPack: 53.35, supplyInstallRatePerM2: 15.98, multi: 6, packPerMulti: 10, pks: 0 },
  { id: "pt2", name: "R2.5 Gold Ceiling Batts 1160x430", supplier: "Bradford", coverage: 9, packCostEx: 29.12, installerRate: 1.4, supplyChargePerPack: 37.33, supplyInstallRatePerM2: 7.6, multi: 4, packPerMulti: 10, pks: 0 },
  { id: "pt3", name: "R4.1 Gold Ceiling Batts 1160x430", supplier: "Bradford", coverage: 5.6, packCostEx: 28.62, installerRate: 1.5, supplyChargePerPack: 36.69, supplyInstallRatePerM2: 10.42, multi: 2, packPerMulti: 10, pks: 5 },
  { id: "pt4", name: "R2.7 Gold Wall Batts 1160x420 HP", supplier: "Bradford", coverage: 2.8, packCostEx: 25.08, installerRate: 1.5, supplyChargePerPack: 32.15, supplyInstallRatePerM2: 18.75, multi: 8, packPerMulti: 10, pks: 0 },
  { id: "pt5", name: "R2.0 Gold Wall Batts 1160x430", supplier: "Bradford", coverage: 12.5, packCostEx: 39.41, installerRate: 1.3, supplyChargePerPack: 50.53, supplyInstallRatePerM2: 6.55, multi: 1, packPerMulti: 10, pks: 5 },
  { id: "pt6", name: "Reflective Wall Wrap", supplier: "Kingspan", coverage: 20, packCostEx: 64.0, installerRate: 0.55, supplyChargePerPack: 78.0, supplyInstallRatePerM2: 4.7, multi: 3, packPerMulti: 10, pks: 0 },
  { id: "pt7", name: "Delivery", supplier: "", coverage: 1, packCostEx: 200, installerRate: 0, supplyChargePerPack: 200, supplyInstallRatePerM2: 200, multi: 0, packPerMulti: 0, pks: 0, nonStock: true },
  { id: "pt8", name: "Retro Fit", supplier: "", coverage: 1, packCostEx: 0, installerRate: 0, supplyChargePerPack: 0, supplyInstallRatePerM2: 0, multi: 0, packPerMulti: 0, pks: 0, nonStock: true },
];
const seedCustomers = [
  { id: "cu1", name: "Stroud Homes", category: "Builder", discountPct: 0, paymentTerms: "7 Days" },
  { id: "cu2", name: "Chalmers Homes", category: "Builder", discountPct: 0, paymentTerms: "7 Days" },
  { id: "cu3", name: "Rad Build", category: "Retro Fit", discountPct: 5, paymentTerms: "30 Days" },
  { id: "cu4", name: "American Homes", category: "Builder", discountPct: 0, paymentTerms: "7 Days" },
  { id: "cu5", name: "PRIVATE", category: "Private", discountPct: 0, paymentTerms: "COD" },
];
const seedSubs = [
  { id: "s1", name: "Lovepreet Singh", phone: "0404 712 002", email: "13singhlovepreet@gmail.com", abn: "" },
  { id: "s2", name: "Anmol Singh Kalsi", phone: "0422 135 827", email: "anmolkalsi6769@gmail.com", abn: "74 665 632 637" },
  { id: "s3", name: "T.Y INT CONSTRUCTION", phone: "0422 021 383", email: "alex@typlastering.com.au", abn: "38 605 990 118" },
  { id: "s4", name: "Mandeep Singh", phone: "0450 280 881", email: "mandeep.bal1995@gmail.com", abn: "97 605 129 315" },
];
const seedSuppliers = [
  { id: "sup1", name: "Bradford (CSR)", contactName: "Sales Desk", phone: "1300 850 305", email: "orders@bradfordinsulation.com.au", address: "Melbourne VIC" },
  { id: "sup2", name: "Kingspan", contactName: "Sales Desk", phone: "1300 244 448", email: "sales@kingspan.com.au", address: "Melbourne VIC" },
  { id: "sup3", name: "Fletcher Insulation", contactName: "Sales Desk", phone: "1800 003 588", email: "sales@fletcherinsulation.com.au", address: "Melbourne VIC" },
  { id: "sup4", name: "Autex Industries", contactName: "Sales Desk", phone: "1800 622 000", email: "sales@autex.com.au", address: "Melbourne VIC" },
];
const seedPurchaseOrders = [
  { id: "po1", poNumber: "PO1001", supplierId: "sup1", orderDate: "2026-08-10", expectedDate: "2026-08-20", status: "Ordered", notes: "", lineItems: [{ partId: "pt1", qty: 20, unitCost: 41.61 }, { partId: "pt4", qty: 30, unitCost: 25.08 }] },
];
const seedLabourItems = [
  { id: "li1", code: "1.1", description: "Foil Wraps – Ground Floor / m² (Thermotuff, Breather)", itemRate: 1.4 },
  { id: "li2", code: "1.2", description: "Foil Wraps – First Floor, scaffold by others / m²", itemRate: 1.4 },
  { id: "li3", code: "1.10", description: "Thermofoil Board Ground Floor /m² (steel frame, tec screws/tape) 10-20mm", itemRate: 1.9 },
  { id: "li4", code: "1.12", description: "Taping of Doors and Windows (60mm black tape, per worksheet qty)", itemRate: 4.2 },
  { id: "li5", code: "1.13", description: "Under Floor Foil 500mm TSSF-30", itemRate: 1.65 },
  { id: "li6", code: "1.15", description: "Dishing Foil wall per metre", itemRate: 3.5 },
  { id: "li7", code: "1.16", description: "Party Wall Sealer install", itemRate: 4.1 },
];
const seedProjects = [
  { id: "p1", quoteNumber: 1001, customerId: "cu1", contactName: "Dale Simmons", contactPhone: "0412 334 221", contactEmail: "dale@stroudhomes.com.au", jobType: "S+F QUOTE", outcome: "Accepted", lotNo: "1750", address: "Torenia Dr", suburb: "Tarneit VIC", entryDate: "2026-07-14", quoteMarkup: 0, notes: "Full ceiling + wall batt install, single storey.", lineItems: [{ partId: "pt1", qty: 40, note: "Ceiling access via manhole in hallway" }, { partId: "pt4", qty: 101, note: "" }, { partId: "pt7", qty: 1, note: "" }] },
  { id: "p2", quoteNumber: 1002, customerId: "cu2", jobType: "SUPPLY & INSTALL", outcome: "Open", lotNo: "22", address: "2 Dock Rd", suburb: "Docklands VIC", entryDate: "2026-09-08", quoteMarkup: -200, notes: "18-unit apartment block, staged delivery required.", lineItems: [{ partId: "pt2", qty: 480 }, { partId: "pt6", qty: 300 }] },
  { id: "p3", quoteNumber: 1003, customerId: "cu3", jobType: "SUPPLY ONLY", outcome: "Open", lotNo: "", address: "88 Marine Pde", suburb: "Torquay VIC", entryDate: "2026-08-20", quoteMarkup: 0, notes: "Client's own installer, materials drop-off only.", lineItems: [{ partId: "pt3", qty: 185 }] },
];
const seedWorkOrders = [
  {
    id: "w1", projectId: "p1", contractorId: "s1", woNumber: 27477, poNumber: "VERH1750/390", poValue: 530.34,
    entryDate: "2026-08-18", completedDate: "", jsaReceived: false, notes: "",
    lines: [
      { id: "wl1", date: "2026-08-26", completed: true, labourItemId: "li7", qty: 7, subcontractorId: "s1", paid: true, note: "FIRE SEALER" },
      { id: "wl2", date: "2026-08-26", completed: true, labourItemId: "li1", qty: 30, subcontractorId: "s1", paid: true, note: "GROUND FLOOR FOIL" },
      { id: "wl3", date: "2026-08-31", completed: false, labourItemId: "li7", qty: 0, subcontractorId: "s1", paid: false, note: "LEAVE DAMP ON SITE" },
    ],
  },
];

// ---------- Quote pricing core ----------
function computeLine(part, qty) {
  if (!part) return { packs: 0, usedForCal: 0, materialCost: 0, labourCost: 0, supplyOnlyCharge: 0, supplyInstallCharge: 0 };
  const q = Number(qty) || 0;
  const packs = part.coverage > 0 ? Math.ceil(q / part.coverage) : 0;
  const usedForCal = packs * part.coverage;
  return { packs, usedForCal, materialCost: packs * part.packCostEx, labourCost: q * part.installerRate, supplyOnlyCharge: packs * part.supplyChargePerPack, supplyInstallCharge: usedForCal * part.supplyInstallRatePerM2 };
}
function computeProjectTotals(project, partById) {
  const isSupplyOnly = project.jobType === "SUPPLY ONLY";
  const lines = (project.lineItems || []).map((li) => ({ ...li, ...computeLine(partById[li.partId], li.qty) }));
  const materialCost = lines.reduce((s, l) => s + l.materialCost, 0);
  const labourCost = isSupplyOnly ? 0 : lines.reduce((s, l) => s + l.labourCost, 0);
  const chargeBeforeMarkup = lines.reduce((s, l) => s + (isSupplyOnly ? l.supplyOnlyCharge : l.supplyInstallCharge), 0);
  const subtotal = chargeBeforeMarkup + Number(project.quoteMarkup || 0);
  const gst = subtotal * 0.1;
  const totalPayable = subtotal + gst;
  const profit = subtotal - materialCost - labourCost;
  const marginPct = subtotal ? profit / subtotal : 0;
  return { lines, isSupplyOnly, materialCost, labourCost, chargeBeforeMarkup, subtotal, gst, totalPayable, profit, marginPct };
}
// Work order labour totals — separate from quote pricing, tracked per contractor task
function computeWOTotals(wo, labourItemById) {
  const lines = (wo.lines || []).map((l) => {
    const li = labourItemById[l.labourItemId];
    const qty = Number(l.qty) || 0;
    return { ...l, contractorCost: li ? qty * li.itemRate : 0 };
  });
  const contractorCost = lines.reduce((s, l) => s + l.contractorCost, 0);
  const allCompleted = lines.length > 0 && lines.every((l) => l.completed);
  const allPaid = lines.length > 0 && lines.every((l) => l.paid);
  return { lines, contractorCost, allCompleted, allPaid };
}

// ---------- UI primitives ----------
const inputStyle = { border: `1px solid ${C.line}`, background: "#fff", color: C.ink };
function Field({ label, children, hint }) {
  return <label className="block mb-3"><span className="block text-sm mb-1" style={{ color: C.inkSoft }}>{label}{hint && <span className="ml-1.5 text-xs" style={{ color: C.inkSoft }}>{hint}</span>}</span>{children}</label>;
}
function TextInput(props) { return <input {...props} className={"w-full rounded-sm px-3 py-2 text-sm outline-none focus:ring-2 " + (props.className || "")} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function TextArea(props) { return <textarea {...props} className="w-full rounded-sm px-3 py-2 text-sm outline-none focus:ring-2" style={inputStyle} />; }
function SelectInput({ children, ...props }) { return <select {...props} className="w-full rounded-sm px-3 py-2 text-sm outline-none focus:ring-2 bg-white">{children}</select>; }
function Checkbox({ checked, onChange }) { return <input type="checkbox" checked={!!checked} onChange={onChange} className="w-4 h-4" style={{ accentColor: C.accent }} />; }
function Button({ variant = "primary", className = "", ...props }) {
  const base = "inline-flex items-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-medium transition-colors";
  const styles = { primary: { background: C.ink, color: C.paper }, outline: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` }, danger: { background: "transparent", color: C.rust, border: `1px solid ${C.rustSoft}` } };
  return <button {...props} className={base + " " + className} style={{ ...styles[variant], opacity: props.disabled ? 0.45 : 1, cursor: props.disabled ? "not-allowed" : "pointer" }} />;
}
function Pill({ label, styleMap }) { const s = styleMap[label] || { bg: C.paperAlt, fg: C.inkSoft }; return <span className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium" style={{ background: s.bg, color: s.fg }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />{label}</span>; }
function Modal({ title, onClose, children, footer, width = "max-w-lg", widthPx }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(28,35,31,0.55)" }} onClick={onClose}>
      <div className={"w-full " + width + " bg-white rounded-sm shadow-2xl flex flex-col"} style={{ border: `1px solid ${C.line}`, maxHeight: "88vh", ...(widthPx ? { maxWidth: widthPx } : {}) }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 className="font-semibold tracking-tight text-lg" style={{ color: C.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-sm hover:bg-black/5"><X size={18} color={C.inkSoft} /></button>
        </div>
        <div className="p-5 overflow-y-auto" style={{ flex: "1 1 auto" }}>{children}</div>
        {footer && <div className="px-5 py-4 shrink-0 flex justify-end gap-2" style={{ borderTop: `1px solid ${C.line}` }}>{footer}</div>}
      </div>
    </div>
  );
}
function EmptyState({ text }) { return <div className="py-10 text-center text-sm" style={{ color: C.inkSoft }}>{text}</div>; }
function Th({ children }) { return <th className="text-left text-xs font-medium px-3 py-2.5" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{children}</th>; }
function Td({ children, className = "" }) { return <td className={"px-3 py-3 text-sm align-middle " + className} style={{ borderBottom: `1px solid ${C.line}`, color: C.ink }}>{children}</td>; }
function ThN({ children }) { return <th className="text-right text-xs font-medium px-3 py-2.5" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{children}</th>; }
function TdN({ children }) { return <td className="px-3 py-3 text-sm text-right" style={{ borderBottom: `1px solid ${C.line}`, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{children}</td>; }
function IconBtn({ onClick, children, title }) { return <button onClick={onClick} title={title} className="p-1.5 rounded-sm hover:bg-black/5">{children}</button>; }
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-sm px-3 py-2" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <Search size={15} color={C.inkSoft} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm outline-none w-full" style={{ color: C.ink }} />
    </div>
  );
}
function KpiCard({ label, value, sub }) {
  return <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}><div className="text-2xl font-semibold tracking-tight" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{value}</div><div className="text-sm mt-1" style={{ color: C.inkSoft }}>{label}</div>{sub && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>{sub}</div>}</div>;
}
function ViewHeader({ title, subtitle, onAdd, addLabel }) {
  return <div className="flex items-start justify-between mb-4"><div><h1 className="text-xl font-semibold tracking-tight" style={{ color: C.ink }}>{title}</h1><p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>{subtitle}</p></div>{onAdd && <Button onClick={onAdd}><Plus size={15} /> {addLabel}</Button>}</div>;
}

// ---------- App ----------
export default function App() {
  const [parts, setParts] = useState(seedParts);
  const [customers, setCustomers] = useState(seedCustomers);
  const [subs, setSubs] = useState(seedSubs);
  const [suppliers, setSuppliers] = useState(seedSuppliers);
  const [purchaseOrders, setPurchaseOrders] = useState(seedPurchaseOrders);
  const [labourItems, setLabourItems] = useState(seedLabourItems);
  const [projects, setProjects] = useState(seedProjects);
  const [workOrders, setWorkOrders] = useState(seedWorkOrders);
  const [view, setView] = useState("dashboard");
  const [pendingWorkOrderId, setPendingWorkOrderId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("coverage-ops-v3", false);
        if (res && res.value) {
          const d = JSON.parse(res.value);
          if (d.parts) setParts(d.parts);
          if (d.customers) setCustomers(d.customers);
          if (d.subs) setSubs(d.subs);
          if (d.suppliers) setSuppliers(d.suppliers);
          if (d.purchaseOrders) setPurchaseOrders(d.purchaseOrders);
          if (d.labourItems) setLabourItems(d.labourItems);
          if (d.projects) setProjects(d.projects);
          if (d.workOrders) setWorkOrders(d.workOrders);
        }
      } catch (e) { /* fall back to sample data */ }
      finally { setLoaded(true); }
    })();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try { await window.storage.set("coverage-ops-v3", JSON.stringify({ parts, customers, subs, suppliers, purchaseOrders, labourItems, projects, workOrders }), false); setSaveState("saved"); }
      catch (e) { setSaveState("idle"); }
    }, 500);
    return () => clearTimeout(t);
  }, [parts, customers, subs, suppliers, purchaseOrders, labourItems, projects, workOrders, loaded]);

  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const customerById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);
  const labourItemById = useMemo(() => Object.fromEntries(labourItems.map((l) => [l.id, l])), [labourItems]);

  const upsert = (setter) => (item) => setter((prev) => prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : [...prev, { ...item, id: item.id || uid("id") }]);
  const remove = (setter) => (id) => setter((prev) => prev.filter((x) => x.id !== id));
  const togglePaid = (woId, lineId) => setWorkOrders((prev) => prev.map((w) => (w.id === woId ? { ...w, lines: w.lines.map((l) => (l.id === lineId ? { ...l, paid: !l.paid } : l)) } : w)));
  const activeWorkOrders = workOrders.filter((w) => !w.archived);

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "projects", label: "Quotes & Jobs", icon: ClipboardList },
    { id: "workorders", label: "Work orders", icon: HardHat },
    { id: "parts", label: "Inventory", icon: Package },
    { id: "suppliers", label: "Suppliers", icon: Truck },
    { id: "purchaseorders", label: "Purchase Orders", icon: ShoppingCart },
    { id: "labouritems", label: "Labour rates", icon: ListChecks },
    { id: "customers", label: "Customers", icon: Building2 },
    { id: "subcontractors", label: "Subcontractors", icon: Users },
    { id: "payments", label: "Contractor Pay", icon: Wallet },
    { id: "reports", label: "Reports", icon: FileBarChart },
  ];

  return (
    <div className="w-full min-h-[640px] flex" style={{ background: C.paper, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { border: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="w-56 shrink-0 flex flex-col justify-between py-5 no-print" style={{ background: C.sidebar }}>
        <div>
          <div className="px-5 mb-6"><div className="text-lg font-semibold tracking-tight" style={{ color: C.sidebarText }}>Coverage</div><div className="text-xs mt-0.5" style={{ color: C.sidebarSoft }}>Insulation supply &amp; install</div></div>
          <nav className="flex flex-col gap-0.5 px-2">
            {nav.map((n) => { const Icon = n.icon; const active = view === n.id; return (
              <button key={n.id} onClick={() => setView(n.id)} className="flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm text-left transition-colors" style={{ background: active ? "rgba(241,241,234,0.1)" : "transparent", color: active ? C.sidebarText : C.sidebarSoft }}>
                <Icon size={16} />{n.label}
              </button>
            ); })}
          </nav>
        </div>
        <div className="px-5 text-xs flex items-center gap-1.5" style={{ color: C.sidebarSoft }}>
          {saveState === "saving" && <><Loader2 size={12} className="animate-spin" /> Saving\u2026</>}
          {saveState === "saved" && <>Saved</>}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-x-auto">
        {view === "dashboard" && <Dashboard projects={projects} workOrders={activeWorkOrders} customerById={customerById} partById={partById} labourItemById={labourItemById} subById={subById} />}
        {view === "calendar" && <CalendarView workOrders={activeWorkOrders} projects={projects} customerById={customerById} subs={subs} labourItemById={labourItemById} onOpenWorkOrder={(woId) => { setPendingWorkOrderId(woId); setView("workorders"); }} />}
        {view === "customers" && <CustomersView customers={customers} upsert={upsert(setCustomers)} remove={remove(setCustomers)} />}
        {view === "subcontractors" && <SubsView subs={subs} upsert={upsert(setSubs)} remove={remove(setSubs)} />}
        {view === "parts" && <PartsView parts={parts} upsert={upsert(setParts)} remove={remove(setParts)} />}
        {view === "suppliers" && <SuppliersView suppliers={suppliers} upsert={upsert(setSuppliers)} remove={remove(setSuppliers)} />}
        {view === "purchaseorders" && <PurchaseOrdersView purchaseOrders={purchaseOrders} suppliers={suppliers} parts={parts} partById={partById} upsert={upsert(setPurchaseOrders)} remove={remove(setPurchaseOrders)} setParts={setParts} />}
        {view === "labouritems" && <LabourItemsView labourItems={labourItems} upsert={upsert(setLabourItems)} remove={remove(setLabourItems)} />}
        {view === "projects" && (
          <ProjectsView projects={projects} customers={customers} customerById={customerById} parts={parts} partById={partById}
            upsert={upsert(setProjects)} remove={remove(setProjects)}
            workOrders={activeWorkOrders} setWorkOrders={setWorkOrders} subs={subs} labourItemById={labourItemById} />
        )}
        {view === "workorders" && (
          <WorkOrdersView workOrders={workOrders} projects={projects} customerById={customerById} subs={subs} labourItems={labourItems} labourItemById={labourItemById} parts={parts} partById={partById}
            upsert={upsert(setWorkOrders)} remove={remove(setWorkOrders)}
            pendingWorkOrderId={pendingWorkOrderId} clearPendingWorkOrder={() => setPendingWorkOrderId(null)} />
        )}
        {view === "payments" && <PaymentsView workOrders={activeWorkOrders} projects={projects} customerById={customerById} subs={subs} labourItemById={labourItemById} togglePaid={togglePaid} />}
        {view === "reports" && <ReportsView projects={projects} customers={customers} customerById={customerById} partById={partById} workOrders={activeWorkOrders} labourItemById={labourItemById} subs={subs} />}
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ projects, workOrders, customerById, partById, labourItemById, subById }) {
  const open = projects.filter((p) => p.outcome === "Open");
  const accepted = projects.filter((p) => p.outcome === "Accepted");
  const pipelineValue = open.reduce((s, p) => s + computeProjectTotals(p, partById).totalPayable, 0);
  const wonValue = accepted.reduce((s, p) => s + computeProjectTotals(p, partById).totalPayable, 0);
  const avgMargin = accepted.length ? accepted.reduce((s, p) => s + computeProjectTotals(p, partById).marginPct, 0) / accepted.length : 0;
  const openWOs = workOrders.filter((w) => !computeWOTotals(w, labourItemById).allCompleted).length;
  const unpaidWOs = workOrders.filter((w) => !computeWOTotals(w, labourItemById).allPaid).length;

  const chartData = projects.map((p) => { const t = computeProjectTotals(p, partById); return { name: (customerById[p.customerId]?.name || "—").slice(0, 14), Materials: Math.round(t.materialCost), Labour: Math.round(t.labourCost), Profit: Math.round(t.profit) }; });
  const recentWO = [...workOrders].sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || "")).slice(0, 5);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight mb-1" style={{ color: C.ink }}>Dashboard</h1>
      <p className="text-sm mb-5" style={{ color: C.inkSoft }}>Pipeline, wins, and who's owed what.</p>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Open quotes" value={open.length} sub={fmtCurrency(pipelineValue) + " pipeline"} />
        <KpiCard label="Accepted jobs" value={accepted.length} sub={fmtCurrency(wonValue) + " won"} />
        <KpiCard label="Avg. margin (accepted)" value={fmtPct(avgMargin)} />
        <KpiCard label="Work orders" value={`${openWOs} open`} sub={`${unpaidWOs} with unpaid lines`} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-medium mb-3" style={{ color: C.ink }}>Cost &amp; profit by job</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => fmtCurrency(v)} contentStyle={{ fontSize: 12, border: `1px solid ${C.line}` }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Materials" stackId="a" fill={C.accent} />
                <Bar dataKey="Labour" stackId="a" fill={C.amber} />
                <Bar dataKey="Profit" stackId="a" fill={C.green} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-medium mb-3" style={{ color: C.ink }}>Recent work orders</div>
          <div className="flex flex-col gap-3">
            {recentWO.length === 0 && <EmptyState text="No work orders yet." />}
            {recentWO.map((w) => { const proj = projects.find((p) => p.id === w.projectId); const t = computeWOTotals(w, labourItemById); return (
              <div key={w.id} className="pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{customerById[proj?.customerId]?.name || "—"}</span><Pill label={t.allCompleted ? "Complete" : "In progress"} styleMap={{ Complete: OUTCOME_STYLES.Accepted, "In progress": OUTCOME_STYLES.Open }} /></div>
                <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{proj?.address || ""} · {subById[w.contractorId]?.name || "Unassigned"} · {w.lines.length} task(s)</div>
              </div>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Customers ----------
function CustomersView({ customers, upsert, remove }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <ViewHeader title="Customers" subtitle="Builders and clients you quote for." onAdd={() => setEditing({})} addLabel="Add customer" />
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Customer</Th><Th>Category</Th><ThN>Standing discount</ThN><Th>Payment terms</Th><Th></Th></tr></thead>
          <tbody>{customers.map((c) => (
            <tr key={c.id} className="hover:bg-black/[0.02]"><Td><span className="font-medium">{c.name}</span></Td>
              <Td>{c.category ? <span className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium" style={{ background: categoryColor(c.category) + "22", color: categoryColor(c.category) }}>{c.category}</span> : "—"}</Td>
              <TdN>{c.discountPct ? `${c.discountPct}%` : "—"}</TdN><Td>{c.paymentTerms || "—"}</Td>
              <Td><div className="flex gap-1 justify-end"><IconBtn title="Edit" onClick={() => setEditing(c)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => remove(c.id)}><Trash2 size={14} color={C.rust} /></IconBtn></div></Td>
            </tr>
          ))}</tbody>
        </table>
        {customers.length === 0 && <EmptyState text="No customers yet." />}
      </div>
      {editing && <Modal title={editing.id ? "Edit customer" : "Add customer"} onClose={() => setEditing(null)}><CustomerForm initial={editing} onCancel={() => setEditing(null)} onSave={(c) => { upsert(c); setEditing(null); }} /></Modal>}
    </div>
  );
}
function CustomerForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", category: "Builder", discountPct: 0, paymentTerms: "7 Days", ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <Field label="Customer name"><TextInput required value={f.name} onChange={set("name")} /></Field>
      <Field label="Category" hint="Builder, Retro Fit, or Private — sets the calendar colour for their jobs">
        <SelectInput value={f.category} onChange={set("category")}>{["Builder", "Retro Fit", "Private"].map((c) => <option key={c} value={c}>{c}</option>)}</SelectInput>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Standing discount %"><TextInput type="number" step="0.1" value={f.discountPct} onChange={set("discountPct")} /></Field>
        <Field label="Payment terms"><SelectInput value={f.paymentTerms} onChange={set("paymentTerms")}>{["7 Days", "COD", "30 Days"].map((t) => <option key={t} value={t}>{t}</option>)}</SelectInput></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave({ ...f, discountPct: Number(f.discountPct) })}>Save customer</Button></div>
    </div>
  );
}

// ---------- Subcontractors ----------
function SubsView({ subs, upsert, remove }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <ViewHeader title="Subcontractors" subtitle="Installers you dispatch work orders to and pay against completed tasks." onAdd={() => setEditing({})} addLabel="Add subcontractor" />
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>ABN</Th><Th></Th></tr></thead>
          <tbody>{subs.map((s) => (
            <tr key={s.id} className="hover:bg-black/[0.02]"><Td><span className="font-medium">{s.name}</span></Td><Td>{s.phone}</Td><Td>{s.email}</Td><Td>{s.abn || <span style={{ color: C.inkSoft }}>individual</span>}</Td>
              <Td><div className="flex gap-1 justify-end"><IconBtn title="Edit" onClick={() => setEditing(s)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => remove(s.id)}><Trash2 size={14} color={C.rust} /></IconBtn></div></Td>
            </tr>
          ))}</tbody>
        </table>
        {subs.length === 0 && <EmptyState text="No subcontractors yet." />}
      </div>
      {editing && <Modal title={editing.id ? "Edit subcontractor" : "Add subcontractor"} onClose={() => setEditing(null)}><SubForm initial={editing} onCancel={() => setEditing(null)} onSave={(s) => { upsert(s); setEditing(null); }} /></Modal>}
    </div>
  );
}
function SubForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", abn: "", ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <Field label="Name / company"><TextInput required value={f.name} onChange={set("name")} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Mobile"><TextInput value={f.phone} onChange={set("phone")} /></Field><Field label="Email"><TextInput type="email" value={f.email} onChange={set("email")} /></Field></div>
      <Field label="ABN" hint="leave blank if paid as an individual"><TextInput value={f.abn} onChange={set("abn")} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave(f)}>Save subcontractor</Button></div>
    </div>
  );
}

// ---------- Inventory (quote pricing: material + labour combined per m²) ----------
// ---------- Suppliers ----------
function SuppliersView({ suppliers, upsert, remove }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <ViewHeader title="Suppliers" subtitle="Who you buy materials from." onAdd={() => setEditing({})} addLabel="Add supplier" />
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Supplier</Th><Th>Contact</Th><Th>Phone</Th><Th>Email</Th><Th>Address</Th><Th></Th></tr></thead>
          <tbody>{suppliers.map((s) => (
            <tr key={s.id} className="hover:bg-black/[0.02]"><Td><span className="font-medium">{s.name}</span></Td><Td>{s.contactName}</Td><Td>{s.phone}</Td><Td>{s.email}</Td><Td>{s.address}</Td>
              <Td><div className="flex gap-1 justify-end"><IconBtn title="Edit" onClick={() => setEditing(s)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => remove(s.id)}><Trash2 size={14} color={C.rust} /></IconBtn></div></Td>
            </tr>
          ))}</tbody>
        </table>
        {suppliers.length === 0 && <EmptyState text="No suppliers yet." />}
      </div>
      {editing && <Modal title={editing.id ? "Edit supplier" : "Add supplier"} onClose={() => setEditing(null)}><SupplierForm initial={editing} onCancel={() => setEditing(null)} onSave={(s) => { upsert(s); setEditing(null); }} /></Modal>}
    </div>
  );
}
function SupplierForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", contactName: "", phone: "", email: "", address: "", ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <Field label="Supplier name"><TextInput required value={f.name} onChange={set("name")} /></Field>
      <Field label="Contact name"><TextInput value={f.contactName} onChange={set("contactName")} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field><Field label="Email"><TextInput type="email" value={f.email} onChange={set("email")} /></Field></div>
      <Field label="Address"><TextInput value={f.address} onChange={set("address")} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave(f)}>Save supplier</Button></div>
    </div>
  );
}

function InlineCell({ value, onCommit, type = "text", align = "right" }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const parsed = type === "number" ? Number(v) || 0 : v; onCommit(parsed); }}
      className="w-full rounded-sm px-1.5 py-1 text-sm bg-transparent hover:bg-black/5 focus:bg-white"
      style={{ border: "1px solid transparent", textAlign: align, color: C.ink, outline: "none" }}
      onFocus={(e) => { e.target.style.border = `1px solid ${C.line}`; }}
    />
  );
}
function ResizableTh({ label, width, align = "right", onResizeStart }) {
  return (
    <th className="relative text-xs font-medium px-3 py-2.5" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}`, textAlign: align, overflow: "hidden", whiteSpace: "nowrap" }}>
      {label}
      <span onMouseDown={onResizeStart} className="absolute top-0 right-0 h-full" style={{ width: 6, cursor: "col-resize" }} />
    </th>
  );
}
function PartsView({ parts, upsert, remove }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [hideNonStock, setHideNonStock] = useState(false);
  const patch = (p, field, value) => upsert({ ...p, [field]: value });

  const visibleParts = parts
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !hideNonStock || !p.nonStock)
    .slice()
    .sort((a, b) => (a.nonStock ? 1 : 0) - (b.nonStock ? 1 : 0));

  const supplierTotals = {};
  parts.forEach((p) => {
    const key = p.supplier || "Unassigned";
    const stockOnHand = (p.packPerMulti || 0) * (p.multi || 0) + (p.pks || 0);
    supplierTotals[key] = (supplierTotals[key] || 0) + p.packCostEx * stockOnHand;
  });
  const supplierRows = Object.entries(supplierTotals).filter(([, v]) => v > 0);
  const grandTotal = supplierRows.reduce((s, [, v]) => s + v, 0);

  const COLS = [
    { key: "name", label: "Item", width: 180, align: "left" },
    { key: "stockOnHand", label: "Stock on hand", width: 100, align: "right" },
    { key: "supplier", label: "Supplier", width: 110, align: "left" },
    { key: "coverage", label: "Coverage/pack", width: 100, align: "right" },
    { key: "packCostEx", label: "Pack cost ex", width: 100, align: "right" },
    { key: "installerRate", label: "Installer rate/m²", width: 120, align: "right" },
    { key: "supplyChargePerPack", label: "Supply/pack", width: 100, align: "right" },
    { key: "pks", label: "Pks", width: 70, align: "right" },
    { key: "multi", label: "Multi", width: 70, align: "right" },
    { key: "packPerMulti", label: "Pack per Multi", width: 110, align: "right" },
    { key: "supplyInstallRatePerM2", label: "Supply+Install/m²", width: 130, align: "right" },
    { key: "inventoryValue", label: "Inventory value", width: 110, align: "right" },
    { key: "actions", label: "", width: 60, align: "right" },
  ];
  const [colWidths, setColWidths] = useState(COLS.map((c) => c.width));
  const [widthsLoaded, setWidthsLoaded] = useState(false);
  const resizingRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("inventory-col-widths", false);
        if (res && res.value) {
          const saved = JSON.parse(res.value);
          if (Array.isArray(saved) && saved.length === COLS.length) setColWidths(saved);
        }
      } catch (e) { /* no saved widths yet */ }
      finally { setWidthsLoaded(true); }
    })();
  }, []);
  useEffect(() => {
    if (!widthsLoaded) return;
    const t = setTimeout(() => { window.storage.set("inventory-col-widths", JSON.stringify(colWidths), false).catch(() => {}); }, 400);
    return () => clearTimeout(t);
  }, [colWidths, widthsLoaded]);

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const { idx, startX, startWidth } = resizingRef.current;
      const next = Math.max(48, startWidth + (e.clientX - startX));
      setColWidths((prev) => prev.map((w, i) => (i === idx ? next : w)));
    };
    const onUp = () => { resizingRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const startResize = (idx) => (e) => { resizingRef.current = { idx, startX: e.clientX, startWidth: colWidths[idx] }; };

  return (
    <div>
      <ViewHeader title="Inventory" subtitle="Click any cell to edit it directly, or drag a column's right edge to resize it." onAdd={() => setEditing({})} addLabel="Add item" />
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(supplierRows.length + 1, 5)}, minmax(0, 1fr))` }}>
        <KpiCard label="Total inventory value" value={fmtCurrency(grandTotal)} />
        {supplierRows.map(([supplier, value]) => (
          <KpiCard key={supplier} label={supplier} value={fmtCurrency(value)} />
        ))}
      </div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="max-w-xs flex-1"><SearchBox value={search} onChange={setSearch} placeholder="Search products" /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.inkSoft }}>
          <input type="checkbox" checked={hideNonStock} onChange={(e) => setHideNonStock(e.target.checked)} style={{ accentColor: C.accent }} />
          Hide non-stock items
        </label>
      </div>
      <div className="rounded-sm overflow-x-auto" style={{ border: `1px solid ${C.line}` }}>
        <table style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0) }}>
          <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead style={{ background: C.card }}>
            <tr>{COLS.map((c, i) => <ResizableTh key={c.key} label={c.label} align={c.align} onResizeStart={startResize(i)} />)}</tr>
          </thead>
          <tbody>{visibleParts.map((p) => {
            const stockOnHand = (p.packPerMulti || 0) * (p.multi || 0) + (p.pks || 0);
            return (
            <tr key={p.id} className="hover:bg-black/[0.02]" style={{ opacity: p.nonStock ? 0.7 : 1 }}>
              <Td>
                <div className="flex items-center gap-1.5">
                  <InlineCell value={p.name} onCommit={(v) => patch(p, "name", v)} align="left" />
                  {p.nonStock && <span className="text-xs px-1.5 py-0.5 rounded-sm shrink-0" style={{ background: C.paperAlt, color: C.inkSoft }}>Non-stock</span>}
                </div>
              </Td>
              <TdN>{stockOnHand}</TdN>
              <Td><InlineCell value={p.supplier || ""} onCommit={(v) => patch(p, "supplier", v)} align="left" /></Td>
              <TdN><InlineCell value={p.coverage} type="number" onCommit={(v) => patch(p, "coverage", v)} /></TdN>
              <TdN><InlineCell value={p.packCostEx} type="number" onCommit={(v) => patch(p, "packCostEx", v)} /></TdN>
              <TdN><InlineCell value={p.installerRate} type="number" onCommit={(v) => patch(p, "installerRate", v)} /></TdN>
              <TdN><InlineCell value={p.supplyChargePerPack} type="number" onCommit={(v) => patch(p, "supplyChargePerPack", v)} /></TdN>
              <TdN><InlineCell value={p.pks ?? 0} type="number" onCommit={(v) => patch(p, "pks", v)} /></TdN>
              <TdN><InlineCell value={p.multi ?? 0} type="number" onCommit={(v) => patch(p, "multi", v)} /></TdN>
              <TdN><InlineCell value={p.packPerMulti ?? 0} type="number" onCommit={(v) => patch(p, "packPerMulti", v)} /></TdN>
              <TdN><InlineCell value={p.supplyInstallRatePerM2} type="number" onCommit={(v) => patch(p, "supplyInstallRatePerM2", v)} /></TdN>
              <TdN>{fmtCurrency(p.packCostEx * stockOnHand)}</TdN>
              <Td><div className="flex gap-1 justify-end"><IconBtn title="Delete" onClick={() => remove(p.id)}><Trash2 size={14} color={C.rust} /></IconBtn></div></Td>
            </tr>
          ); })}</tbody>
        </table>
        {visibleParts.length === 0 && <EmptyState text={parts.length === 0 ? "No items in inventory yet." : "No items match your search/filter."} />}
      </div>
      {editing && <Modal title="Add item" onClose={() => setEditing(null)}><PartForm initial={editing} onCancel={() => setEditing(null)} onSave={(p) => { upsert(p); setEditing(null); }} /></Modal>}
    </div>
  );
}
function PartForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", coverage: 1, packCostEx: 0, installerRate: 0, supplyChargePerPack: 0, pks: 0, multi: 0, packPerMulti: 0, supplyInstallRatePerM2: 0, supplier: "", nonStock: false, ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <Field label="Item name"><TextInput required value={f.name} onChange={set("name")} /></Field>
      <Field label="Supplier"><TextInput value={f.supplier} onChange={set("supplier")} /></Field>
      <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer" style={{ color: C.ink }}>
        <input type="checkbox" checked={f.nonStock} onChange={(e) => setF({ ...f, nonStock: e.target.checked })} style={{ accentColor: C.accent }} />
        Non-stock item (e.g. Delivery, Retro Fit) \u2014 sits at the bottom of the list, no stock tracked
      </label>
      <div className="grid grid-cols-2 gap-3"><Field label="Coverage per pack (m²)"><TextInput type="number" step="0.1" value={f.coverage} onChange={set("coverage")} /></Field><Field label="Pack cost, ex GST ($)"><TextInput type="number" step="0.01" value={f.packCostEx} onChange={set("packCostEx")} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Installer rate ($/m²)"><TextInput type="number" step="0.01" value={f.installerRate} onChange={set("installerRate")} /></Field><Field label="Supply charge ($/pack)"><TextInput type="number" step="0.01" value={f.supplyChargePerPack} onChange={set("supplyChargePerPack")} /></Field></div>
      <div className="grid grid-cols-3 gap-3"><Field label="Pks"><TextInput type="number" step="1" value={f.pks} onChange={set("pks")} /></Field><Field label="Multi"><TextInput type="number" step="1" value={f.multi} onChange={set("multi")} /></Field><Field label="Pack per Multi"><TextInput type="number" step="1" value={f.packPerMulti} onChange={set("packPerMulti")} /></Field></div>
      <div className="text-sm rounded-sm p-2 mb-3" style={{ background: C.card, color: C.inkSoft }}>Stock on hand (calculated): <span className="font-medium" style={{ color: C.ink }}>{(Number(f.packPerMulti) || 0) * (Number(f.multi) || 0) + (Number(f.pks) || 0)}</span></div>
      <Field label="Supply+Install charge ($/m²)"><TextInput type="number" step="0.01" value={f.supplyInstallRatePerM2} onChange={set("supplyInstallRatePerM2")} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave({ ...f, coverage: Number(f.coverage), packCostEx: Number(f.packCostEx), installerRate: Number(f.installerRate), supplyChargePerPack: Number(f.supplyChargePerPack), pks: Number(f.pks), multi: Number(f.multi), packPerMulti: Number(f.packPerMulti), supplyInstallRatePerM2: Number(f.supplyInstallRatePerM2) })}>Save item</Button></div>
    </div>
  );
}

// ---------- Labour rate schedule (work order task pricing: contractor cost vs customer charge) ----------
function LabourItemsView({ labourItems, upsert, remove }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <ViewHeader title="Labour rates" subtitle="Task-based rate schedule used to price and pay work order lines." onAdd={() => setEditing({})} addLabel="Add labour item" />
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Code</Th><Th>Description</Th><ThN>Contractor rate</ThN><Th></Th></tr></thead>
          <tbody>{labourItems.map((l) => (
            <tr key={l.id} className="hover:bg-black/[0.02]"><Td><span className="font-medium">{l.code}</span></Td><Td>{l.description}</Td><TdN>{fmtCurrency(l.itemRate)}</TdN>
              <Td><div className="flex gap-1 justify-end"><IconBtn title="Edit" onClick={() => setEditing(l)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => remove(l.id)}><Trash2 size={14} color={C.rust} /></IconBtn></div></Td>
            </tr>
          ))}</tbody>
        </table>
        {labourItems.length === 0 && <EmptyState text="No labour items yet." />}
      </div>
      {editing && <Modal title={editing.id ? "Edit labour item" : "Add labour item"} onClose={() => setEditing(null)}><LabourItemForm initial={editing} onCancel={() => setEditing(null)} onSave={(l) => { upsert(l); setEditing(null); }} /></Modal>}
    </div>
  );
}
function LabourItemForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ code: "", description: "", itemRate: 0, ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <div className="grid grid-cols-3 gap-3"><Field label="Code"><TextInput required value={f.code} onChange={set("code")} /></Field><div className="col-span-2"><Field label="Description"><TextInput required value={f.description} onChange={set("description")} /></Field></div></div>
      <Field label="Contractor rate ($/unit)"><TextInput type="number" step="0.01" value={f.itemRate} onChange={set("itemRate")} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave({ ...f, itemRate: Number(f.itemRate) })}>Save labour item</Button></div>
    </div>
  );
}

// ---------- Purchase Orders ----------
function PurchaseOrdersView({ purchaseOrders, suppliers, parts, partById, upsert, remove, setParts }) {
  const [editing, setEditing] = useState(null);
  const [receivingPO, setReceivingPO] = useState(null);
  const formRef = useRef(null);
  const supplierById = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  const poTotal = (po) => (po.lineItems || []).reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitCost) || 0), 0);

  return (
    <div>
      <ViewHeader title="Purchase Orders" subtitle="Orders placed with suppliers to restock inventory." onAdd={() => setEditing({ poNumber: `PO${1001 + purchaseOrders.length}` })} addLabel="New purchase order" />
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>PO #</Th><Th>Supplier</Th><Th>Order date</Th><Th>Expected</Th><Th>Status</Th><ThN>Total</ThN><Th></Th></tr></thead>
          <tbody>{purchaseOrders.map((po) => (
            <tr key={po.id} className="hover:bg-black/[0.02]">
              <Td>{po.poNumber}</Td><Td>{supplierById[po.supplierId]?.name || "—"}</Td><Td>{fmtDMY(po.orderDate)}</Td><Td>{fmtDMY(po.expectedDate)}</Td>
              <Td><Pill label={po.status} styleMap={{ Ordered: OUTCOME_STYLES.Open, Received: OUTCOME_STYLES.Accepted, Cancelled: OUTCOME_STYLES.Cancelled }} /></Td>
              <TdN>{fmtCurrency(poTotal(po))}</TdN>
              <Td><div className="flex gap-1 justify-end">
                {po.status === "Ordered" && <Button variant="outline" onClick={() => setReceivingPO(po)}>Mark received</Button>}
                <IconBtn title="Edit" onClick={() => setEditing(po)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => remove(po.id)}><Trash2 size={14} color={C.rust} /></IconBtn>
              </div></Td>
            </tr>
          ))}</tbody>
        </table>
        {purchaseOrders.length === 0 && <EmptyState text="No purchase orders yet." />}
      </div>
      {editing && <Modal title={editing.id ? "Edit purchase order" : "New purchase order"} onClose={() => setEditing(null)} width="max-w-4xl" widthPx="1100px"
        footer={<><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="button" onClick={() => formRef.current?.submit()}>Save purchase order</Button></>}>
        <PurchaseOrderForm ref={formRef} initial={editing} suppliers={suppliers} parts={parts} partById={partById} onSave={(po) => { upsert(po); setEditing(null); }} />
      </Modal>}
      {receivingPO && (
        <ReceiveStockModal po={receivingPO} partById={partById} onClose={() => setReceivingPO(null)}
          onConfirm={(receipts) => {
            setParts((prev) => prev.map((p) => {
              const idx = receivingPO.lineItems.findIndex((li) => li.partId === p.id);
              if (idx === -1) return p;
              const r = receipts[idx];
              return { ...p, multi: (p.multi || 0) + (Number(r.multis) || 0), pks: (p.pks || 0) + (Number(r.pks) || 0) };
            }));
            upsert({ ...receivingPO, status: "Received", receivedDate: new Date().toISOString().slice(0, 10) });
            setReceivingPO(null);
          }} />
      )}
    </div>
  );
}
function ReceiveStockModal({ po, partById, onClose, onConfirm }) {
  const [receipts, setReceipts] = useState(po.lineItems.map((li) => ({ multis: 0, pks: li.qty })));
  const updateReceipt = (i, patch) => setReceipts((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <Modal title={`Receive stock \u2014 ${po.poNumber}`} onClose={onClose} width="max-w-3xl"
      footer={<><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={() => onConfirm(receipts)}>Confirm receipt</Button></>}>
      <p className="text-sm mb-3" style={{ color: C.inkSoft }}>For each item, split what actually arrived between full multi-packs and loose packs. Defaults to everything as loose packs \u2014 adjust as needed.</p>
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Item</Th><ThN>Ordered (packs)</ThN><ThN>Multis received</ThN><ThN>Loose pks received</ThN><ThN>Total packs</ThN></tr></thead>
          <tbody>{po.lineItems.map((li, i) => {
            const part = partById[li.partId];
            const r = receipts[i];
            const totalPacks = (part?.packPerMulti || 0) * (Number(r.multis) || 0) + (Number(r.pks) || 0);
            return (
              <tr key={i}>
                <Td>{part?.name || "—"}{part?.packPerMulti ? <span className="text-xs" style={{ color: C.inkSoft }}> ({part.packPerMulti} packs/multi)</span> : null}</Td>
                <TdN>{li.qty}</TdN>
                <TdN><TextInput type="number" className="w-20 text-right" value={r.multis} onChange={(e) => updateReceipt(i, { multis: e.target.value })} /></TdN>
                <TdN><TextInput type="number" className="w-20 text-right" value={r.pks} onChange={(e) => updateReceipt(i, { pks: e.target.value })} /></TdN>
                <TdN><span style={{ color: totalPacks === li.qty ? C.inkSoft : C.amber }}>{totalPacks}</span></TdN>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </Modal>
  );
}
const PurchaseOrderForm = forwardRef(function PurchaseOrderForm({ initial, suppliers, parts, partById, onSave }, ref) {
  const [f, setF] = useState({ poNumber: "", supplierId: suppliers[0]?.id || "", orderDate: "", expectedDate: "", status: "Ordered", notes: "", lineItems: [], ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLineItems = (lineItems) => setF({ ...f, lineItems });
  const doSave = () => onSave({ ...f, id: f.id || uid("po") });
  useImperativeHandle(ref, () => ({ submit: doSave }));

  const addLine = () => setLineItems([...f.lineItems, { partId: parts[0]?.id || "", qty: 0, unitCost: parts[0]?.packCostEx || 0 }]);
  const updateLine = (i, patch) => setLineItems(f.lineItems.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i) => setLineItems(f.lineItems.filter((_, idx) => idx !== i));
  const total = f.lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitCost) || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier"><SelectInput value={f.supplierId} onChange={set("supplierId")}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
        <Field label="Status"><SelectInput value={f.status} onChange={set("status")}>{["Ordered", "Received", "Cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="P/O number"><TextInput value={f.poNumber} onChange={set("poNumber")} /></Field>
        <Field label="Order date"><TextInput type="date" value={f.orderDate} onChange={set("orderDate")} /></Field>
        <Field label="Expected date"><TextInput type="date" value={f.expectedDate} onChange={set("expectedDate")} /></Field>
      </div>

      <div className="flex items-center justify-between mb-1"><span className="text-sm" style={{ color: C.inkSoft }}>Line items</span><button type="button" onClick={addLine} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Plus size={13} /> Add line</button></div>
      <div className="rounded-sm overflow-hidden mb-3" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Item</Th><ThN>Qty (packs)</ThN><ThN>Unit cost</ThN><ThN>Line total</ThN><Th></Th></tr></thead>
          <tbody>{f.lineItems.map((li, i) => (
            <tr key={i}>
              <Td><SelectInput value={li.partId} onChange={(e) => updateLine(i, { partId: e.target.value, unitCost: partById[e.target.value]?.packCostEx || 0 })}>{parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Td>
              <TdN><TextInput type="number" className="w-20 text-right" value={li.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></TdN>
              <TdN><TextInput type="number" step="0.01" className="w-24 text-right" value={li.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} /></TdN>
              <TdN>{fmtCurrency((Number(li.qty) || 0) * (Number(li.unitCost) || 0))}</TdN>
              <Td><button type="button" onClick={() => removeLine(i)}><X size={14} color={C.rust} /></button></Td>
            </tr>
          ))}</tbody>
        </table>
        {f.lineItems.length === 0 && <EmptyState text="No line items yet." />}
      </div>
      <Field label="Notes"><TextArea rows={2} value={f.notes} onChange={set("notes")} /></Field>
      <div className="rounded-sm p-3 flex items-center justify-between text-sm" style={{ background: C.card }}>
        <span style={{ color: C.inkSoft }}>{f.lineItems.length} line item(s)</span>
        <span className="font-medium">Total {fmtCurrency(total)}</span>
      </div>
    </div>
  );
});

// ---------- Quote line item editor ----------
function LineItemsEditor({ lineItems, setLineItems, parts, partById }) {
  const addLine = () => setLineItems([...lineItems, { partId: parts[0]?.id || "", qty: 0, note: "" }]);
  const updateLine = (i, patch) => setLineItems(lineItems.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  return (
    <div>
      <div className="flex items-center justify-between mb-1"><span className="text-sm" style={{ color: C.inkSoft }}>Line items</span><button type="button" onClick={addLine} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Plus size={13} /> Add line</button></div>
      <div className="rounded-sm overflow-hidden mb-1" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Part</Th><ThN>Qty (m²)</ThN><ThN>Packs</ThN><ThN>Material $</ThN><ThN>Labour $</ThN><ThN>Charge $</ThN><Th></Th></tr></thead>
          <tbody>{lineItems.map((li, i) => { const part = partById[li.partId]; const c = computeLine(part, li.qty); return (
            <React.Fragment key={i}>
              <tr>
                <Td><SelectInput value={li.partId} onChange={(e) => updateLine(i, { partId: e.target.value })}>{parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Td>
                <TdN><TextInput type="number" className="w-20 text-right" value={li.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></TdN>
                <TdN>{c.packs}</TdN><TdN>{fmtCurrency(c.materialCost)}</TdN><TdN>{fmtCurrency(c.labourCost)}</TdN><TdN>{fmtCurrency(c.supplyInstallCharge)}</TdN>
                <Td><button type="button" onClick={() => removeLine(i)}><X size={14} color={C.rust} /></button></Td>
              </tr>
              <tr>
                <td colSpan={7} className="px-3 pb-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <TextInput value={li.note || ""} onChange={(e) => updateLine(i, { note: e.target.value })} placeholder="Note for this line (e.g. access notes, colour, install detail)" className="text-xs" />
                </td>
              </tr>
            </React.Fragment>
          ); })}</tbody>
        </table>
        {lineItems.length === 0 && <EmptyState text="No line items yet." />}
      </div>
    </div>
  );
}

// ---------- Projects / Quotes ----------
function ProjectsView({ projects, customers, customerById, parts, partById, upsert, remove, workOrders, setWorkOrders, subs, labourItemById }) {
  const [editing, setEditing] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [pickerProject, setPickerProject] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const formRef = useRef(null);

  const buildWorkOrderFromQuote = (project, contractorId) => {
    const totals = computeProjectTotals(project, partById);
    const defaultContractor = contractorId || subs[0]?.id || "";
    return {
      id: uid("wo"), projectId: project.id, contractorId: defaultContractor, woNumber: project.quoteNumber ? `QW${project.quoteNumber}` : "", poNumber: "",
      poValue: Math.round(totals.totalPayable * 100) / 100, entryDate: "", completedDate: "", jsaReceived: false, notes: "",
      lines: (project.lineItems || []).map((li) => ({
        id: uid("wl"), date: "", completed: false, labourItemId: labourItemById ? Object.keys(labourItemById)[0] : "",
        partId: li.partId, qty: li.qty, subcontractorId: defaultContractor, paid: false, note: li.note || "",
      })),
    };
  };

  if (printingId) {
    const project = projects.find((p) => p.id === printingId);
    if (project) return <QuotePrintView project={project} customer={customerById[project.customerId]} partById={partById} onClose={() => setPrintingId(null)} />;
  }

  return (
    <div>
      <ViewHeader title="Quotes & jobs" subtitle="Select a customer, add line items, and the pricing calculates itself." onAdd={() => setEditing({ quoteNumber: (Math.max(1000, ...projects.map((p) => p.quoteNumber || 0)) + 1) })} addLabel="New quote" />
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setShowArchived(!showArchived)} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}>
          {showArchived ? "Back to active quotes" : `View archived (${projects.filter((p) => p.archived).length})`}
        </button>
      </div>
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Quote #</Th><Th>Customer</Th><Th>Category</Th><Th>Job type</Th><Th>Outcome</Th><Th>Address</Th><ThN>Total (inc GST)</ThN><ThN>Margin</ThN><Th></Th></tr></thead>
          <tbody>{projects.filter((p) => (showArchived ? p.archived : !p.archived)).map((p) => { const t = computeProjectTotals(p, partById); return (
            <tr key={p.id} className="hover:bg-black/[0.02] cursor-pointer" onClick={() => setEditing(p)}>
              <Td>{fmtQuoteNo(p.quoteNumber)}</Td><Td><span className="font-medium">{customerById[p.customerId]?.name || "—"}</span></Td>
              <Td>{(() => { const cat = p.category || customerById[p.customerId]?.category; return cat ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="w-2 h-2 rounded-sm" style={{ background: categoryColor(cat) }} />{cat}</span> : "—"; })()}</Td>
              <Td>{p.jobType}</Td><Td><Pill label={p.outcome} styleMap={OUTCOME_STYLES} /></Td><Td>{p.address}{p.suburb ? `, ${p.suburb}` : ""}</Td>
              <TdN>{fmtCurrency(t.totalPayable)}</TdN><TdN><span style={{ color: t.marginPct < 0 ? C.rust : C.green }}>{fmtPct(t.marginPct)}</span></TdN>
              <Td><div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                {showArchived ? (
                  <Button variant="outline" onClick={() => upsert({ ...p, archived: false })}>Restore</Button>
                ) : (
                  <><IconBtn title="Edit" onClick={() => setEditing(p)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => setConfirmDeleteId(p.id)}><Trash2 size={14} color={C.rust} /></IconBtn></>
                )}
              </div></Td>
            </tr>
          ); })}</tbody>
        </table>
        {projects.length === 0 && <EmptyState text="No quotes yet." />}
      </div>
      {editing && <Modal title={`${editing.id ? "Edit quote" : "New quote"}${editing.quoteNumber ? ` ${fmtQuoteNo(editing.quoteNumber)}` : ""}`} onClose={() => setEditing(null)} width="max-w-6xl" widthPx="1300px"
        footer={<><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="button" onClick={() => formRef.current?.submit()}>Save quote</Button></>}>
        <ProjectForm ref={formRef} initial={editing} customers={customers} parts={parts} partById={partById}
          workOrders={editing.id ? workOrders.filter((w) => w.projectId === editing.id) : []} subs={subs} labourItemById={labourItemById}
          onCancel={() => setEditing(null)}
          onSave={(p) => {
            upsert(p);
            const alreadyHasWO = workOrders.some((w) => w.projectId === p.id);
            if (p.outcome === "Accepted" && !alreadyHasWO) {
              setWorkOrders((prev) => [...prev, buildWorkOrderFromQuote(p)]);
            }
            setEditing(null);
          }}
          onPrint={editing.id ? () => { setPrintingId(editing.id); setEditing(null); } : null}
          onGenerateWO={editing.id ? () => setPickerProject(editing) : null} />
      </Modal>}
      {pickerProject && (
        <WorkOrderPicker project={pickerProject} subs={subs} partById={partById} onClose={() => setPickerProject(null)}
          onCreate={(selectedLines, contractorId) => {
            const wo = buildWorkOrderFromQuote({ ...pickerProject, lineItems: selectedLines }, contractorId);
            setWorkOrders((prev) => [...prev, wo]);
            setPickerProject(null);
          }} />
      )}
      {confirmDeleteId && (() => { const p = projects.find((x) => x.id === confirmDeleteId); return (
        <Modal title="Delete this quote?" onClose={() => setConfirmDeleteId(null)}
          footer={<><Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>No, keep it</Button><Button type="button" variant="danger" onClick={() => { upsert({ ...p, archived: true }); setConfirmDeleteId(null); }}>Yes, delete it</Button></>}>
          <p className="text-sm" style={{ color: C.ink }}>Are you sure you want to delete {fmtQuoteNo(p?.quoteNumber)} – {customerById[p?.customerId]?.name || "this quote"}?</p>
          <p className="text-xs mt-2" style={{ color: C.inkSoft }}>It won't be permanently removed — it'll be archived, and you can restore it later from "View archived" on this page.</p>
        </Modal>
      ); })()}
    </div>
  );
}

// ---------- Split a quote across multiple contractors ----------
function WorkOrderPicker({ project, subs, partById, onClose, onCreate }) {
  const [selected, setSelected] = useState(project.lineItems.map(() => true));
  const [contractorId, setContractorId] = useState(subs[0]?.id || "");
  const toggle = (i) => setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const anySelected = selected.some(Boolean);
  return (
    <Modal title={`Create work order — ${fmtQuoteNo(project.quoteNumber)}`} onClose={onClose}
      footer={<><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={!anySelected} onClick={() => onCreate(project.lineItems.filter((_, i) => selected[i]), contractorId)}>Create work order</Button></>}>
      <Field label="Contractor for this work order">
        <SelectInput value={contractorId} onChange={(e) => setContractorId(e.target.value)}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>
      </Field>
      <div className="text-sm mb-2" style={{ color: C.inkSoft }}>Which products is this contractor doing? Untick anything going to another contractor — you can run this again for the rest.</div>
      <div className="flex flex-col gap-2">
        {project.lineItems.map((li, i) => (
          <label key={i} className="flex items-center gap-2 rounded-sm p-2 cursor-pointer" style={{ border: `1px solid ${C.line}` }}>
            <Checkbox checked={selected[i]} onChange={() => toggle(i)} />
            <span className="text-sm">{partById[li.partId]?.name || "—"} — {li.qty} m²{li.note ? <span style={{ color: C.inkSoft }}> ({li.note})</span> : null}</span>
          </label>
        ))}
        {project.lineItems.length === 0 && <EmptyState text="This quote has no product lines yet." />}
      </div>
    </Modal>
  );
}
// ---------- Photos & documents (SWMS etc.) ----------
function AttachmentsPanel({ projectId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("Photo");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(`attachments:${projectId}`, false);
        if (res && res.value) setItems(JSON.parse(res.value));
      } catch (e) { /* nothing saved yet */ }
      finally { setLoaded(true); }
    })();
  }, [projectId]);

  const persist = async (next) => {
    const prev = items;
    setItems(next);
    setError("");
    try {
      const result = await window.storage.set(`attachments:${projectId}`, JSON.stringify(next), false);
      if (!result) throw new Error("save failed");
    } catch (e) {
      setItems(prev);
      setError("Couldn't save — this job's photos/documents may be over the 5MB storage limit. Try a smaller file, or remove one first.");
    }
  };

  const handleFiles = async (fileList) => {
    setUploading(true);
    setError("");
    const files = Array.from(fileList);
    const newItems = [...items];
    for (const file of files) {
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        newItems.push({ id: uid("att"), name: file.name, mimeType: file.type, category, uploadedDate: new Date().toISOString().slice(0, 10), dataUrl });
      } catch (e) { /* skip file that failed to read */ }
    }
    await persist(newItems);
    setUploading(false);
  };

  const removeItem = (id) => persist(items.filter((i) => i.id !== id));

  if (!loaded) return <div className="text-sm" style={{ color: C.inkSoft }}>Loading attachments\u2026</div>;
  const photos = items.filter((i) => i.category === "Photo");
  const docs = items.filter((i) => i.category !== "Photo");

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-sm" style={{ color: C.inkSoft }}>Photos &amp; documents</span>
        <div className="flex items-center gap-2">
          <SelectInput className="w-36" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="Photo">Photo</option><option value="SWMS">SWMS</option><option value="Other">Other document</option>
          </SelectInput>
          <label className="text-xs font-medium flex items-center gap-1 cursor-pointer rounded-sm px-2 py-1" style={{ color: C.accent, border: `1px solid ${C.line}` }}>
            <Upload size={13} /> {uploading ? "Uploading\u2026" : "Add file"}
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ""; }} disabled={uploading} />
          </label>
        </div>
      </div>
      {error && <div className="text-xs rounded-sm p-2 mb-2" style={{ background: C.rustSoft, color: C.rust }}>{error}</div>}

      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-2">
          {photos.map((p) => (
            <div key={p.id} className="relative rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <img src={p.dataUrl} alt={p.name} className="w-full h-20 object-cover" />
              <button type="button" onClick={() => removeItem(p.id)} className="absolute top-1 right-1 rounded-full" style={{ background: "rgba(255,255,255,0.9)" }}><X size={12} color={C.rust} /></button>
            </div>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="flex flex-col gap-1">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-sm px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}>
              <a href={d.dataUrl} download={d.name} className="flex items-center gap-2" style={{ color: C.accent }}><FileText size={14} /> {d.name} <span className="text-xs" style={{ color: C.inkSoft }}>({d.category})</span></a>
              <button type="button" onClick={() => removeItem(d.id)}><X size={14} color={C.rust} /></button>
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && <div className="text-xs py-2" style={{ color: C.inkSoft }}>No photos or documents yet.</div>}
    </div>
  );
}
const ProjectForm = forwardRef(function ProjectForm({ initial, customers, parts, partById, workOrders, subs, labourItemById, onSave, onCancel, onPrint, onGenerateWO }, ref) {
  const [f, setF] = useState({ customerId: customers[0]?.id || "", contactName: "", contactPhone: "", contactEmail: "", jobType: "S+F QUOTE", outcome: "Open", lotNo: "", address: "", suburb: "", entryDate: "", notes: "", quoteMarkup: 0, lineItems: [], ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLineItems = (lineItems) => setF({ ...f, lineItems });
  const doSave = () => onSave({ ...f, id: f.id || uid("proj"), quoteMarkup: Number(f.quoteMarkup) });
  useImperativeHandle(ref, () => ({ submit: doSave }));
  const t = computeProjectTotals(f, partById);
  const customer = customers.find((c) => c.id === f.customerId);
  return (
    <form id="quote-form" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Customer" hint={customer?.discountPct ? `standing ${customer.discountPct}% discount` : undefined}><SelectInput value={f.customerId} onChange={(e) => { const newCustomer = customers.find((c) => c.id === e.target.value); setF({ ...f, customerId: e.target.value, category: newCustomer?.category || f.category }); }}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
        <Field label="Job type"><SelectInput value={f.jobType} onChange={set("jobType")}>{["S+F QUOTE", "SUPPLY & INSTALL", "SUPPLY ONLY", "MATERIAL QUOTE", "OPTION QUOTE"].map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput></Field>
        <Field label="Category" hint="defaults from the customer, editable per quote">
          <SelectInput value={f.category || customer?.category || "Builder"} onChange={set("category")}>{["Builder", "Retro Fit", "Private"].map((c) => <option key={c} value={c}>{c}</option>)}</SelectInput>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Contact name"><TextInput value={f.contactName} onChange={set("contactName")} /></Field>
        <Field label="Contact phone"><TextInput value={f.contactPhone} onChange={set("contactPhone")} /></Field>
        <Field label="Contact email"><TextInput type="email" value={f.contactEmail} onChange={set("contactEmail")} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3"><Field label="Lot no."><TextInput value={f.lotNo} onChange={set("lotNo")} /></Field><Field label="Address"><TextInput value={f.address} onChange={set("address")} /></Field><Field label="Suburb"><TextInput value={f.suburb} onChange={set("suburb")} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Entry date"><TextInput type="date" value={f.entryDate} onChange={set("entryDate")} /></Field><Field label="Outcome"><SelectInput value={f.outcome} onChange={set("outcome")}>{["Open", "Accepted", "Lost", "Cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput></Field></div>
      <LineItemsEditor lineItems={f.lineItems} setLineItems={setLineItems} parts={parts} partById={partById} />
      <Field label="Quote markup / discount ($)" hint="negative = discount"><TextInput type="number" step="1" value={f.quoteMarkup} onChange={set("quoteMarkup")} /></Field>
      <Field label="Notes"><TextArea rows={3} value={f.notes} onChange={set("notes")} /></Field>

      {initial.id ? <AttachmentsPanel projectId={initial.id} /> : <div className="text-xs rounded-sm p-2 mb-4" style={{ background: C.card, color: C.inkSoft }}>Save this quote to start attaching photos, SWMS, or other documents.</div>}
      <div className="rounded-sm p-3 grid grid-cols-3 gap-3 text-sm mb-4" style={{ background: C.card }}>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>Subtotal (ex GST)</div><div className="font-medium">{fmtCurrency(t.subtotal)}</div></div>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>GST</div><div className="font-medium">{fmtCurrency(t.gst)}</div></div>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>Total payable</div><div className="font-medium">{fmtCurrency(t.totalPayable)}</div></div>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>Material cost</div><div className="font-medium">{fmtCurrency(t.materialCost)}</div></div>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>Labour cost</div><div className="font-medium">{fmtCurrency(t.labourCost)}</div></div>
        <div><div className="text-xs" style={{ color: C.inkSoft }}>Profit / margin</div><div className="font-medium" style={{ color: t.marginPct < 0 ? C.rust : C.green }}>{fmtCurrency(t.profit)} ({fmtPct(t.marginPct)})</div></div>
      </div>
      {(onPrint || onGenerateWO) && (
        <div className="flex items-center gap-2 mb-4">
          {onPrint && <Button type="button" variant="outline" onClick={onPrint}><Printer size={14} /> Print quote (PDF)</Button>}
          {onGenerateWO && <Button type="button" variant="outline" onClick={onGenerateWO}><Zap size={14} /> Start a work order for this job</Button>}
        </div>
      )}
      {workOrders && workOrders.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium mb-2" style={{ color: C.ink }}>Work orders</div>
          <div className="flex flex-col gap-2">
            {workOrders.map((w) => { const wt = computeWOTotals(w, labourItemById); return (
              <div key={w.id} className="rounded-sm p-3 flex items-center justify-between" style={{ border: `1px solid ${C.line}` }}>
                <div><div className="text-sm font-medium">{subs.find((s) => s.id === w.contractorId)?.name || "Unassigned"}</div><div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{w.lines.length} task line(s) · {fmtCurrency(wt.contractorCost)} to contractor</div></div>
                <Pill label={wt.allCompleted ? "Complete" : "In progress"} styleMap={{ Complete: OUTCOME_STYLES.Accepted, "In progress": OUTCOME_STYLES.Open }} />
              </div>
            ); })}
          </div>
        </div>
      )}
    </form>
  );
});
function QuotePrintView({ project, customer, partById, onClose }) {
  const t = computeProjectTotals(project, partById);
  const usedLines = t.lines.filter((l) => Number(l.qty) > 0);
  const isSupplyOnly = t.isSupplyOnly;
  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="flex items-center gap-2 mb-5 no-print">
        <Button variant="outline" onClick={onClose}><X size={14} /> Close</Button>
        <Button onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Button>
      </div>
      <div className="max-w-3xl mx-auto p-10" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="flex items-start justify-between mb-8">
          <div><div className="text-2xl font-semibold tracking-tight" style={{ color: C.ink }}>Quote {fmtQuoteNo(project.quoteNumber)}</div><div className="text-sm mt-1" style={{ color: C.inkSoft }}>{project.jobType}{project.entryDate ? ` · ${fmtDMY(project.entryDate)}` : ""}</div></div>
          <div className="text-right text-sm" style={{ color: C.inkSoft }}>{project.lotNo && <div>Lot {project.lotNo}</div>}<div>{project.address}</div><div>{project.suburb}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div><div className="text-xs mb-1" style={{ color: C.inkSoft }}>Customer</div><div className="font-medium">{customer?.name || "—"}</div></div>
          <div><div className="text-xs mb-1" style={{ color: C.inkSoft }}>Contact</div><div>{project.contactName || "—"}</div>{project.contactPhone && <div>{project.contactPhone}</div>}{project.contactEmail && <div>{project.contactEmail}</div>}</div>
        </div>

        <table className="w-full mb-2" style={{ borderTop: `1px solid ${C.line}` }}>
          <thead><tr><Th>Product</Th><ThN>Price</ThN></tr></thead>
          <tbody>{usedLines.map((l, i) => (
            <React.Fragment key={i}>
              <tr><td className="px-3 pt-2 pb-0.5 text-sm" style={{ color: C.ink }}>{partById[l.partId]?.name || "—"}</td><td className="px-3 pt-2 pb-0.5 text-sm text-right" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(isSupplyOnly ? l.supplyOnlyCharge : l.supplyInstallCharge)}</td></tr>
              {l.note && <tr><td colSpan={2} className="px-3 pb-2 text-xs" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{l.note}</td></tr>}
              {!l.note && <tr><td colSpan={2} style={{ borderBottom: `1px solid ${C.line}`, height: 0 }}></td></tr>}
            </React.Fragment>
          ))}
          {usedLines.length === 0 && <tr><td colSpan={2}><EmptyState text="No products on this quote yet." /></td></tr>}
          </tbody>
        </table>

        {project.notes && <div className="mt-6 mb-6">
          <div className="text-xs font-medium mb-1" style={{ color: C.inkSoft }}>Notes</div>
          <div className="text-sm rounded-sm p-3" style={{ background: C.card, color: C.ink }}>{project.notes}</div>
        </div>}

        <div className="flex justify-end mt-6">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-1"><span style={{ color: C.inkSoft }}>Subtotal (ex GST)</span><span>{fmtCurrency(t.subtotal)}</span></div>
            <div className="flex justify-between py-1"><span style={{ color: C.inkSoft }}>GST</span><span>{fmtCurrency(t.gst)}</span></div>
            <div className="flex justify-between py-2 font-semibold text-base" style={{ borderTop: `1px solid ${C.line}` }}><span>Total</span><span>{fmtCurrency(t.totalPayable)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ---------- Work Orders (PO header + labour task lines) ----------
function WorkOrdersView({ workOrders, projects, customerById, subs, labourItems, labourItemById, parts, partById, upsert, remove, pendingWorkOrderId, clearPendingWorkOrder }) {
  const [editing, setEditing] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const formRef = useRef(null);
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  useEffect(() => {
    if (pendingWorkOrderId) {
      const wo = workOrders.find((w) => w.id === pendingWorkOrderId);
      if (wo) setEditing(wo);
      clearPendingWorkOrder();
    }
  }, [pendingWorkOrderId]);

  if (printingId) {
    const wo = workOrders.find((w) => w.id === printingId);
    const proj = wo ? projectById[wo.projectId] : null;
    const sub = wo ? subs.find((s) => s.id === wo.contractorId) : null;
    if (wo) return <WorkOrderPrintView workOrder={wo} project={proj} customer={proj ? customerById[proj.customerId] : null} sub={sub} partById={partById} labourItemById={labourItemById} onClose={() => setPrintingId(null)} />;
  }

  return (
    <div>
      <ViewHeader title="Work orders" subtitle="Purchase orders issued to contractors, with task-by-task completion and pay tracking." onAdd={() => setEditing({})} addLabel="Add work order" />
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setShowArchived(!showArchived)} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}>
          {showArchived ? "Back to active work orders" : `View archived (${workOrders.filter((w) => w.archived).length})`}
        </button>
      </div>
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Work order #</Th><Th>Customer</Th><Th>Job</Th><Th>Contractor</Th><Th>P/O #</Th><ThN>P/O value</ThN><ThN>Tasks</ThN><ThN>Contractor cost</ThN><Th>JSA</Th><Th></Th></tr></thead>
          <tbody>{workOrders.filter((w) => (showArchived ? w.archived : !w.archived)).map((w) => { const proj = projectById[w.projectId]; const sub = subs.find((s) => s.id === w.contractorId); const wt = computeWOTotals(w, labourItemById); return (
            <tr key={w.id} className="hover:bg-black/[0.02]">
              <Td>{w.woNumber || "—"}</Td><Td>{proj ? customerById[proj.customerId]?.name || "—" : "—"}</Td><Td>{proj ? `${proj.address}${proj.suburb ? ", " + proj.suburb : ""}` : "—"}</Td><Td>{sub?.name || "Unassigned"}</Td><Td>{w.poNumber || "—"}</Td>
              <TdN>{fmtCurrency(w.poValue)}</TdN><TdN>{w.lines.length}</TdN><TdN>{fmtCurrency(wt.contractorCost)}</TdN>
              <Td>{w.jsaReceived ? <span style={{ color: C.green }}>✓</span> : <span style={{ color: C.inkSoft }}>—</span>}</Td>
              <Td><div className="flex gap-1 justify-end">
                {showArchived ? (
                  <Button variant="outline" onClick={() => upsert({ ...w, archived: false })}>Restore</Button>
                ) : (
                  <><IconBtn title="Print (PDF)" onClick={() => setPrintingId(w.id)}><Printer size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Edit" onClick={() => setEditing(w)}><Pencil size={14} color={C.inkSoft} /></IconBtn><IconBtn title="Delete" onClick={() => setConfirmDeleteId(w.id)}><Trash2 size={14} color={C.rust} /></IconBtn></>
                )}
              </div></Td>
            </tr>
          ); })}</tbody>
        </table>
        {workOrders.length === 0 && <EmptyState text="No work orders yet — open a quote and start one, or add manually." />}
      </div>
      {editing && <Modal title={`${editing.id ? "Edit work order" : "Add work order"}${editing.woNumber ? ` ${editing.woNumber}` : ""}`} onClose={() => setEditing(null)} width="max-w-6xl" widthPx="1400px"
        footer={<><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="button" onClick={() => formRef.current?.submit()}>Save work order</Button></>}>
        <WorkOrderForm ref={formRef} initial={editing} projects={projects} subs={subs} labourItems={labourItems} labourItemById={labourItemById} parts={parts} partById={partById} customerById={customerById} onCancel={() => setEditing(null)} onSave={(w) => { upsert(w); setEditing(null); }} />
      </Modal>}
      {confirmDeleteId && (() => { const w = workOrders.find((x) => x.id === confirmDeleteId); const proj = w ? projectById[w.projectId] : null; return (
        <Modal title="Delete this work order?" onClose={() => setConfirmDeleteId(null)}
          footer={<><Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>No, keep it</Button><Button type="button" variant="danger" onClick={() => { upsert({ ...w, archived: true }); setConfirmDeleteId(null); }}>Yes, delete it</Button></>}>
          <p className="text-sm" style={{ color: C.ink }}>Are you sure you want to delete {w?.woNumber || "this work order"}{proj ? ` \u2013 ${proj.address}` : ""}?</p>
          <p className="text-xs mt-2" style={{ color: C.inkSoft }}>It won't be permanently removed \u2014 it'll be archived, and you can restore it later from "View archived" on this page.</p>
        </Modal>
      ); })()}
    </div>
  );
}
function WorkOrderPrintView({ workOrder, project, customer, sub, partById, labourItemById, onClose }) {
  const wt = computeWOTotals(workOrder, labourItemById);
  const mailtoHref = () => {
    const to = sub?.email || "";
    const subject = encodeURIComponent(`Work order ${workOrder.woNumber || ""} – ${project ? project.address : ""}`);
    const body = encodeURIComponent(`Hi ${sub?.name || ""},\n\nPlease find the work order attached (save the PDF from the print screen and attach it here).\n\nJob: ${project ? `${project.address}${project.suburb ? ", " + project.suburb : ""}` : ""}\n\nThanks.`);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };
  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="flex items-center gap-2 mb-5 no-print">
        <Button variant="outline" onClick={onClose}><X size={14} /> Close</Button>
        <Button onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Button>
        <a href={mailtoHref()}><Button type="button" variant="outline"><FileText size={14} /> Email to contractor</Button></a>
      </div>
      <div className="max-w-5xl mx-auto p-10" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="flex items-start justify-between mb-8">
          <div><div className="text-2xl font-semibold tracking-tight" style={{ color: C.ink }}>Work Order {workOrder.woNumber || ""}</div><div className="text-sm mt-1" style={{ color: C.inkSoft }}>{workOrder.entryDate ? `Entry ${fmtDMY(workOrder.entryDate)}` : ""}{workOrder.poNumber ? ` · P/O ${workOrder.poNumber}` : ""}</div></div>
          <div className="text-right text-sm" style={{ color: C.inkSoft }}>{project?.lotNo && <div>Lot {project.lotNo}</div>}<div>{project?.address}</div><div>{project?.suburb}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div><div className="text-xs mb-1" style={{ color: C.inkSoft }}>Customer</div><div className="font-medium">{customer?.name || "—"}</div></div>
          <div><div className="text-xs mb-1" style={{ color: C.inkSoft }}>Contractor</div><div>{sub?.name || "—"}</div>{sub?.phone && <div>{sub.phone}</div>}{sub?.email && <div>{sub.email}</div>}</div>
        </div>
        <div className="text-sm mb-4"><span style={{ color: C.inkSoft }}>JSA received: </span><span className="font-medium">{workOrder.jsaReceived ? "Yes" : "No"}</span></div>

        <table className="w-full mb-2" style={{ borderTop: `1px solid ${C.line}` }}>
          <thead><tr><Th>Product</Th><Th>Task</Th><ThN>Qty</ThN><Th>Date</Th></tr></thead>
          <tbody>{workOrder.lines.map((l, i) => (
            <React.Fragment key={i}>
              <tr>
                <td className="px-3 pt-2 pb-0.5 text-sm" style={{ color: C.ink }}>{l.partId ? (partById?.[l.partId]?.name || "—") : "—"}</td>
                <td className="px-3 pt-2 pb-0.5 text-sm" style={{ color: C.ink }}>{labourItemById[l.labourItemId]?.description || "—"}</td>
                <td className="px-3 pt-2 pb-0.5 text-sm text-right" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{l.qty} m²</td>
                <td className="px-3 pt-2 pb-0.5 text-sm" style={{ color: C.ink }}>{fmtDMY(l.date)}</td>
              </tr>
              {l.note && <tr><td colSpan={4} className="px-3 pb-2 text-xs" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{l.note}</td></tr>}
              {!l.note && <tr><td colSpan={4} style={{ borderBottom: `1px solid ${C.line}`, height: 0 }}></td></tr>}
            </React.Fragment>
          ))}
          {workOrder.lines.length === 0 && <tr><td colSpan={4}><EmptyState text="No tasks on this work order yet." /></td></tr>}
          </tbody>
        </table>

        {workOrder.notes && <div className="mt-6 mb-6">
          <div className="text-xs font-medium mb-1" style={{ color: C.inkSoft }}>Notes</div>
          <div className="text-sm rounded-sm p-3" style={{ background: C.card, color: C.ink }}>{workOrder.notes}</div>
        </div>}

        <div className="flex justify-end mt-6">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-2 font-semibold text-base" style={{ borderTop: `1px solid ${C.line}` }}><span>Contractor total</span><span>{fmtCurrency(wt.contractorCost)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
const WorkOrderForm = forwardRef(function WorkOrderForm({ initial, projects, subs, labourItems, labourItemById, parts, partById, customerById, onSave, onCancel }, ref) {
  const [f, setF] = useState({ projectId: projects[0]?.id || "", contractorId: subs[0]?.id || "", woNumber: "", poNumber: "", poValue: 0, entryDate: "", completedDate: "", jsaReceived: false, notes: "", lines: [], ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setChk = (k) => (e) => setF({ ...f, [k]: e.target.checked });
  const doSave = () => onSave({ ...f, poValue: Number(f.poValue) });
  useImperativeHandle(ref, () => ({ submit: doSave }));

  const addLine = () => setF({ ...f, lines: [...f.lines, { id: uid("wl"), date: "", completed: false, labourItemId: labourItems[0]?.id || "", qty: 0, subcontractorId: f.contractorId, paid: false, note: "" }] });
  const updateLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const removeLine = (i) => setF({ ...f, lines: f.lines.filter((_, idx) => idx !== i) });

  const wt = computeWOTotals(f, labourItemById);

  return (
    <form id="wo-form" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job" hint={(() => { const p = projects.find((x) => x.id === f.projectId); return p ? customerById?.[p.customerId]?.name : undefined; })()}>
          <SelectInput value={f.projectId} onChange={set("projectId")}>{projects.map((p) => <option key={p.id} value={p.id}>{customerById?.[p.customerId]?.name || "—"} \u2014 {p.address}{p.suburb ? `, ${p.suburb}` : ""}</option>)}</SelectInput>
        </Field>
        <Field label="Contractor"><SelectInput value={f.contractorId} onChange={(e) => { const newId = e.target.value; setF({ ...f, contractorId: newId, lines: f.lines.map((l) => ({ ...l, subcontractorId: newId })) }); }}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <Field label="Work order #" hint="from the quote"><TextInput value={f.woNumber} onChange={set("woNumber")} placeholder="e.g. QW1001" /></Field>
        <Field label="P/O number"><TextInput value={f.poNumber} onChange={set("poNumber")} placeholder="e.g. VERH1750/390" /></Field>
        <Field label="P/O value ($)" hint="from the quote"><TextInput type="number" step="0.01" value={f.poValue} onChange={set("poValue")} /></Field>
        <Field label="Entry date"><TextInput type="date" value={f.entryDate} onChange={set("entryDate")} /></Field>
        <Field label="Completed date"><TextInput type="date" value={f.completedDate} onChange={set("completedDate")} /></Field>
      </div>
      <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: C.ink }}><Checkbox checked={f.jsaReceived} onChange={setChk("jsaReceived")} /> JSA received</label>

      <div className="flex items-center justify-between mb-1"><span className="text-sm" style={{ color: C.inkSoft }}>Task lines</span><button type="button" onClick={addLine} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Plus size={13} /> Add task</button></div>
      <div className="rounded-sm mb-3 overflow-x-auto" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full text-sm"><thead style={{ background: C.card }}><tr><Th>Product</Th><Th>Date</Th><Th>Compl.</Th><Th>Task</Th><ThN>Qty</ThN><Th>Paid</Th><ThN>Contractor $</ThN><Th></Th></tr></thead>
          <tbody>{f.lines.map((l, i) => { const li = labourItemById[l.labourItemId]; const qty = Number(l.qty) || 0; return (
            <React.Fragment key={l.id || i}>
              <tr>
                <Td><span className="text-xs" style={{ color: C.inkSoft }}>{l.partId ? (partById?.[l.partId]?.name || "—") : "—"}</span></Td>
                <Td><TextInput type="date" className="w-32" value={l.date} onChange={(e) => updateLine(i, { date: e.target.value })} /></Td>
                <Td><Checkbox checked={l.completed} onChange={(e) => updateLine(i, { completed: e.target.checked })} /></Td>
                <Td><SelectInput value={l.labourItemId} onChange={(e) => updateLine(i, { labourItemId: e.target.value })}>{labourItems.map((x) => <option key={x.id} value={x.id}>{x.code} – {x.description}</option>)}</SelectInput></Td>
                <TdN><TextInput type="number" className="w-16 text-right" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></TdN>
                <Td><Checkbox checked={l.paid} onChange={(e) => updateLine(i, { paid: e.target.checked })} /></Td>
                <TdN>{fmtCurrency(li ? qty * li.itemRate : 0)}</TdN>
                <Td><button type="button" onClick={() => removeLine(i)}><X size={14} color={C.rust} /></button></Td>
              </tr>
              <tr>
                <td colSpan={8} className="px-3 pb-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <TextInput value={l.note} onChange={(e) => updateLine(i, { note: e.target.value })} placeholder="Note for this task (e.g. site instructions, access, condition on arrival)" className="text-xs w-full" />
                </td>
              </tr>
            </React.Fragment>
          ); })}</tbody>
        </table>
        {f.lines.length === 0 && <EmptyState text="No task lines yet." />}
      </div>
      <Field label="Work order notes"><TextArea rows={2} value={f.notes} onChange={set("notes")} /></Field>

      <div className="rounded-sm p-3 flex items-center justify-between text-sm mb-4" style={{ background: C.card }}>
        <span style={{ color: C.inkSoft }}>{f.lines.length} task(s), {f.lines.filter((l) => l.completed).length} completed, {f.lines.filter((l) => l.paid).length} paid</span>
        <span className="font-medium">Contractor {fmtCurrency(wt.contractorCost)}</span>
      </div>
    </form>
  );
});

// ---------- Calendar ----------
const CAL_COLORS = [C.accent, C.amber, C.green, C.rust, "#7A5EA6"];
const CATEGORY_COLORS = { Builder: "#2563EB", "Retro Fit": "#16A34A", Private: "#EAB308" };
const categoryColor = (cat) => CATEGORY_COLORS[cat] || C.inkSoft;
function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function getWeekDays(anchor) {
  const start = startOfWeek(anchor);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  return days;
}

function CalendarView({ workOrders, projects, customerById, subs, labourItemById, onOpenWorkOrder }) {
  const today = new Date();
  const [cursor, setCursor] = useState(today);
  const [contractorFilter, setContractorFilter] = useState("All");
  const [spanWeeks, setSpanWeeks] = useState(1);
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const subById = Object.fromEntries(subs.map((s) => [s.id, s]));

  const items = [];
  workOrders.forEach((w) => {
    const proj = projectById[w.projectId];
    (w.lines || []).forEach((l) => {
      if (!l.date) return;
      const contractorId = w.contractorId;
      if (contractorFilter !== "All" && contractorId !== contractorFilter) return;
      const li = labourItemById[l.labourItemId];
      items.push({
        date: l.date, contractorId, completed: !!l.completed, workOrderId: w.id,
        customerName: proj ? customerById[proj.customerId]?.name || "—" : "—",
        category: proj?.category || (proj ? customerById[proj.customerId]?.category : "") || "",
        job: proj ? `${proj.address}${proj.suburb ? ", " + proj.suburb : ""}` : "—",
        quoteNumber: proj?.quoteNumber, woNumber: w.woNumber, task: li?.description || "Task", qty: l.qty,
      });
    });
  });
  const byDate = {};
  items.forEach((it) => { (byDate[it.date] = byDate[it.date] || []).push(it); });

  const weekBlocks = Array.from({ length: spanWeeks }, (_, i) => getWeekDays(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i * 7)));
  const rangeStart = weekBlocks[0][0], rangeEnd = weekBlocks[weekBlocks.length - 1][6];
  const rangeLabel = rangeStart.getMonth() === rangeEnd.getMonth()
    ? `${rangeStart.getDate()}–${rangeEnd.getDate()} ${rangeEnd.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}`
    : `${rangeStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${rangeEnd.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
  const cardMinHeight = spanWeeks === 1 ? 420 : spanWeeks === 2 ? 260 : 190;

  return (
    <div>
      <ViewHeader title="Calendar" subtitle="Scheduled work order tasks, week by week." />
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <IconBtn title={`Previous ${spanWeeks > 1 ? spanWeeks + " weeks" : "week"}`} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7 * spanWeeks))}><ChevronLeft size={16} color={C.inkSoft} /></IconBtn>
        <div className="text-sm font-medium w-56" style={{ color: C.ink }}>{rangeLabel}</div>
        <IconBtn title={`Next ${spanWeeks > 1 ? spanWeeks + " weeks" : "week"}`} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * spanWeeks))}><ChevronRight size={16} color={C.inkSoft} /></IconBtn>
        <Button variant="outline" onClick={() => setCursor(today)}>This week</Button>
        <span className="text-sm ml-2" style={{ color: C.inkSoft }}>Show</span>
        <SelectInput className="w-32" value={spanWeeks} onChange={(e) => setSpanWeeks(Number(e.target.value))}>
          <option value={1}>1 week</option><option value={2}>2 weeks</option><option value={3}>3 weeks</option>
        </SelectInput>
        <div className="flex-1" />
        <span className="text-sm" style={{ color: C.inkSoft }}>Contractor</span>
        <SelectInput className="w-44" value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)}>
          <option value="All">All contractors</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectInput>
      </div>
      <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: C.inkSoft }}>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{cat}</div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {weekBlocks.map((weekDays, wi) => (
          <div key={wi}>
            {spanWeeks > 1 && <div className="text-xs font-medium mb-1" style={{ color: C.inkSoft }}>{weekDays[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – {weekDays[6].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d, i) => {
                const iso = fmtISO(d);
                const isToday = iso === fmtISO(today);
                const dayItems = (byDate[iso] || []).sort((a, b) => (subById[a.contractorId]?.name || "").localeCompare(subById[b.contractorId]?.name || ""));
                return (
                  <div key={i} className="rounded-sm" style={{ border: `1px solid ${C.line}`, background: isToday ? C.accentSoft : "#fff", minHeight: cardMinHeight }}>
                    <div className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${C.line}`, background: isToday ? "transparent" : C.card }}>
                      <div className="text-xs font-medium" style={{ color: isToday ? C.accent : C.inkSoft }}>{d.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                      <div className="text-sm font-semibold" style={{ color: isToday ? C.accent : C.ink }}>{d.getDate()}</div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-1.5">
                      {dayItems.length === 0 && <div className="text-xs text-center py-4" style={{ color: C.inkSoft }}>—</div>}
                      {dayItems.map((it, idx) => (
                        <div key={idx} onDoubleClick={() => onOpenWorkOrder(it.workOrderId)} title="Double-click to open this work order" className="rounded-sm p-2 cursor-pointer" style={{ border: `2px solid ${categoryColor(it.category)}`, background: categoryColor(it.category) + "1A" }}>
                          <div className="text-xs font-medium" style={{ color: C.ink }}>{subById[it.contractorId]?.name || "Unassigned"}</div>
                          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{it.customerName}</div>
                          {spanWeeks === 1 && <div className="text-xs" style={{ color: C.inkSoft }}>{fmtQuoteNo(it.quoteNumber)}{it.woNumber ? ` · ${it.woNumber}` : ""}</div>}
                          <div className="text-xs mt-1" style={{ color: C.ink }}>{it.task}</div>
                          {spanWeeks === 1 && <div className="text-xs" style={{ color: C.inkSoft }}>{it.qty} m²</div>}
                          <div className="mt-1"><Pill label={it.completed ? "Completed" : "Scheduled"} styleMap={{ Completed: OUTCOME_STYLES.Accepted, Scheduled: OUTCOME_STYLES.Open }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Contractor Payments ----------
function startOfWeek(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}
function periodInfo(dateStr, period) {
  if (!dateStr) return { key: "0000", label: "No date" };
  const d = new Date(dateStr + "T00:00:00");
  if (period === "week") {
    const s = startOfWeek(d);
    return { key: s.toISOString().slice(0, 10), label: `Week of ${s.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` };
  }
  if (period === "month") return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-AU", { month: "short", year: "numeric" }) };
  return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
}

function PaymentsView({ workOrders, projects, customerById, subs, labourItemById, togglePaid }) {
  const [period, setPeriod] = useState("month");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const subById = Object.fromEntries(subs.map((s) => [s.id, s]));

  const records = [];
  workOrders.forEach((w) => {
    const proj = projectById[w.projectId];
    (w.lines || []).forEach((l) => {
      const li = labourItemById[l.labourItemId];
      records.push({
        workOrderId: w.id, lineId: l.id, date: l.date,
        contractorId: w.contractorId,
        customerName: proj ? customerById[proj.customerId]?.name || "—" : "—",
        quoteNumber: fmtQuoteNo(proj?.quoteNumber),
        job: proj ? `${proj.address}${proj.suburb ? ", " + proj.suburb : ""}` : "—",
        task: li ? `${li.code} – ${li.description}` : "—",
        qty: Number(l.qty) || 0,
        amount: li ? (Number(l.qty) || 0) * li.itemRate : 0,
        paid: !!l.paid, completed: !!l.completed,
      });
    });
  });

  const filtered = records.filter((r) =>
    (contractorFilter === "All" || r.contractorId === contractorFilter) &&
    (statusFilter === "All" || (statusFilter === "Paid" ? r.paid : !r.paid))
  );

  const totals = filtered.reduce((acc, r) => { if (r.paid) acc.paid += r.amount; else acc.unpaid += r.amount; return acc; }, { paid: 0, unpaid: 0 });

  const groups = {};
  filtered.forEach((r) => {
    const pInfo = periodInfo(r.date, period);
    const key = `${pInfo.key}__${r.contractorId}`;
    if (!groups[key]) groups[key] = { periodKey: pInfo.key, periodLabel: pInfo.label, contractorId: r.contractorId, paid: 0, unpaid: 0, count: 0 };
    if (r.paid) groups[key].paid += r.amount; else groups[key].unpaid += r.amount;
    groups[key].count += 1;
  });
  const groupRows = Object.values(groups).sort((a, b) => b.periodKey.localeCompare(a.periodKey) || (subById[a.contractorId]?.name || "").localeCompare(subById[b.contractorId]?.name || ""));

  const exportPayments = () => {
    const data = filtered.map((r) => ({
      Date: fmtDMY(r.date), Contractor: subById[r.contractorId]?.name || "Unassigned", Customer: r.customerName, "Quote #": r.quoteNumber,
      Job: r.job, Task: r.task, Qty: r.qty, Amount: r.amount, Status: r.paid ? "Paid" : "Unpaid",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Contractor Payments");
    XLSX.writeFile(wb, "coverage-contractor-payments.xlsx");
  };

  return (
    <div>
      <ViewHeader title="Contractor Pay" subtitle="Job payments to each contractor, by week, month, or year." />
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm" style={{ color: C.inkSoft }}>Group by</span>
        <SelectInput className="w-32" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option>
        </SelectInput>
        <span className="text-sm ml-2" style={{ color: C.inkSoft }}>Contractor</span>
        <SelectInput className="w-48" value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)}>
          <option value="All">All contractors</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectInput>
        <span className="text-sm ml-2" style={{ color: C.inkSoft }}>Status</span>
        <SelectInput className="w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All</option><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option>
        </SelectInput>
        <div className="flex-1" />
        <button onClick={exportPayments} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Download size={13} /> Export Excel</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Paid" value={fmtCurrency(totals.paid)} />
        <KpiCard label="Unpaid" value={fmtCurrency(totals.unpaid)} />
        <KpiCard label="Task lines" value={filtered.length} />
      </div>

      <div className="text-sm font-medium mb-2" style={{ color: C.ink }}>{period === "week" ? "Weekly" : period === "month" ? "Monthly" : "Yearly"} summary</div>
      <div className="rounded-sm overflow-hidden mb-6" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Period</Th><Th>Contractor</Th><ThN>Tasks</ThN><ThN>Paid</ThN><ThN>Unpaid</ThN><ThN>Total</ThN></tr></thead>
          <tbody>{groupRows.map((g, i) => (
            <tr key={i}><Td>{g.periodLabel}</Td><Td>{subById[g.contractorId]?.name || "Unassigned"}</Td><TdN>{g.count}</TdN>
              <TdN>{fmtCurrency(g.paid)}</TdN><TdN><span style={{ color: g.unpaid > 0 ? C.rust : C.inkSoft }}>{fmtCurrency(g.unpaid)}</span></TdN><TdN>{fmtCurrency(g.paid + g.unpaid)}</TdN>
            </tr>
          ))}
          {groupRows.length === 0 && <tr><td colSpan={6}><EmptyState text="No contractor payments recorded yet." /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="text-sm font-medium mb-2" style={{ color: C.ink }}>Payment detail</div>
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Date</Th><Th>Contractor</Th><Th>Customer</Th><Th>Quote #</Th><Th>Job</Th><Th>Task</Th><ThN>Amount</ThN><Th>Status</Th></tr></thead>
          <tbody>{filtered.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r, i) => (
            <tr key={i}>
              <Td>{fmtDMY(r.date)}</Td><Td>{subById[r.contractorId]?.name || "Unassigned"}</Td><Td>{r.customerName}</Td><Td>{r.quoteNumber}</Td><Td>{r.job}</Td><Td className="text-xs">{r.task}</Td>
              <TdN>{fmtCurrency(r.amount)}</TdN>
              <Td>
                <button onClick={() => togglePaid(r.workOrderId, r.lineId)} className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium" style={{ background: r.paid ? C.greenSoft : C.amberSoft, color: r.paid ? C.green : C.amber }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.paid ? C.green : C.amber }} />{r.paid ? "Paid" : "Unpaid"}
                </button>
              </Td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={8}><EmptyState text="No payment records match this filter." /></td></tr>}
          </tbody>
        </table>
      </div>

      <ContractorPaymentRun workOrders={workOrders} projects={projects} customerById={customerById} subs={subs} />
    </div>
  );
}

function ContractorPaymentRun({ workOrders, projects, customerById, subs }) {
  const [runContractor, setRunContractor] = useState(subs[0]?.id || "All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const rows = workOrders.filter((w) => {
    if (runContractor !== "All" && w.contractorId !== runContractor) return false;
    if (!fromDate && !toDate) return true;
    const taskDates = (w.lines || []).map((l) => l.date).filter(Boolean);
    const datesToCheck = taskDates.length ? taskDates : [w.entryDate].filter(Boolean);
    if (datesToCheck.length === 0) return false;
    return datesToCheck.some((d) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate));
  }).map((w) => {
    const proj = projectById[w.projectId];
    const exGst = Number(w.poValue) || 0;
    return {
      workOrderId: w.id, woNumber: w.woNumber, poNumber: w.poNumber,
      customerName: proj ? customerById[proj.customerId]?.name || "—" : "—",
      address: proj ? `${proj.address}${proj.suburb ? ", " + proj.suburb : ""}` : "—",
      poValue: exGst, totalExGst: exGst, totalIncGst: exGst * 1.1,
    };
  });
  const totals = rows.reduce((acc, r) => { acc.poValue += r.poValue; acc.exGst += r.totalExGst; acc.incGst += r.totalIncGst; return acc; }, { poValue: 0, exGst: 0, incGst: 0 });

  const exportRun = () => {
    const data = rows.map((r) => ({
      Customer: r.customerName, "Work order #": r.woNumber, Address: r.address, "P/O Value": r.poValue, "Total ex GST": r.totalExGst, "Total with GST": r.totalIncGst,
    }));
    data.push({ Customer: "TOTAL", "Work order #": "", Address: "", "P/O Value": totals.poValue, "Total ex GST": totals.exGst, "Total with GST": totals.incGst });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Payment run");
    XLSX.writeFile(wb, "coverage-contractor-payment-run.xlsx");
  };

  return (
    <div className="mt-8">
      <div className="text-sm font-medium mb-2" style={{ color: C.ink }}>Contractor payment run</div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Pick a contractor (and optionally a date range) to get the exact list and amounts to pay this week. GST is calculated at 10%.</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm" style={{ color: C.inkSoft }}>Contractor</span>
        <SelectInput className="w-48" value={runContractor} onChange={(e) => setRunContractor(e.target.value)}>
          <option value="All">All contractors</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectInput>
        <span className="text-sm ml-2" style={{ color: C.inkSoft }}>From</span>
        <TextInput type="date" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <span className="text-sm" style={{ color: C.inkSoft }}>To</span>
        <TextInput type="date" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <div className="flex-1" />
        <button onClick={exportRun} className="text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Download size={13} /> Export Excel</button>
      </div>
      <div className="rounded-sm overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Customer</Th><Th>Work order #</Th><Th>Address</Th><ThN>P/O Value</ThN><ThN>Total ex GST</ThN><ThN>Total with GST</ThN></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.workOrderId}><Td>{r.customerName}</Td><Td>{r.woNumber || "—"}</Td><Td>{r.address}</Td>
              <TdN>{fmtCurrency(r.poValue)}</TdN><TdN>{fmtCurrency(r.totalExGst)}</TdN><TdN>{fmtCurrency(r.totalIncGst)}</TdN>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6}><EmptyState text="No work orders match this contractor/date range." /></td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ background: C.card }}>
            <Td><span className="font-medium">Total</span></Td><Td></Td><Td></Td>
            <TdN><span className="font-medium">{fmtCurrency(totals.poValue)}</span></TdN>
            <TdN><span className="font-medium">{fmtCurrency(totals.exGst)}</span></TdN>
            <TdN><span className="font-medium">{fmtCurrency(totals.incGst)}</span></TdN>
          </tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

// ---------- Reports ----------
function ReportsView({ projects, customers, customerById, partById, workOrders, labourItemById, subs }) {
  const [outcomeFilter, setOutcomeFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const filtered = projects.filter((p) => (outcomeFilter === "All" || p.outcome === outcomeFilter) && (customerFilter === "All" || p.customerId === customerFilter));
  const rows = filtered.map((p) => ({ p, t: computeProjectTotals(p, partById) }));
  const totals = rows.reduce((acc, { t }) => { acc.material += t.materialCost; acc.labour += t.labourCost; acc.subtotal += t.subtotal; acc.gst += t.gst; acc.total += t.totalPayable; acc.profit += t.profit; return acc; }, { material: 0, labour: 0, subtotal: 0, gst: 0, total: 0, profit: 0 });
  const totalMargin = totals.subtotal ? totals.profit / totals.subtotal : 0;

  const contractorRows = subs.map((s) => {
    const theirWOs = workOrders.filter((w) => w.contractorId === s.id);
    const acc = theirWOs.reduce((a, w) => {
      const t = computeWOTotals(w, labourItemById);
      a.contractorCost += t.contractorCost;
      a.tasksCompleted += t.lines.filter((l) => l.completed).length;
      a.tasksUnpaid += t.lines.filter((l) => l.completed && !l.paid).length;
      return a;
    }, { contractorCost: 0, tasksCompleted: 0, tasksUnpaid: 0 });
    return { sub: s, workOrderCount: theirWOs.length, ...acc };
  }).filter((r) => r.workOrderCount > 0);
  const contractorTotals = contractorRows.reduce((acc, r) => { acc.contractorCost += r.contractorCost; acc.tasksUnpaid += r.tasksUnpaid; return acc; }, { contractorCost: 0, tasksUnpaid: 0 });

  const exportJobPL = () => {
    const data = rows.map(({ p, t }) => ({
      Customer: customerById[p.customerId]?.name || "", "Job type": p.jobType, Outcome: p.outcome,
      Material: t.materialCost, Labour: t.labourCost, Subtotal: t.subtotal, GST: t.gst, Total: t.totalPayable, Profit: t.profit, "Margin %": Math.round(t.marginPct * 1000) / 10,
    }));
    data.push({ Customer: "TOTAL", "Job type": "", Outcome: "", Material: totals.material, Labour: totals.labour, Subtotal: totals.subtotal, GST: totals.gst, Total: totals.total, Profit: totals.profit, "Margin %": Math.round(totalMargin * 1000) / 10 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Job P&L");
    XLSX.writeFile(wb, "coverage-job-pl.xlsx");
  };
  const exportContractors = () => {
    const data = contractorRows.map((r) => ({
      Contractor: r.sub.name, "Work orders": r.workOrderCount, "Tasks completed": r.tasksCompleted, "Tasks unpaid": r.tasksUnpaid,
      "Contractor cost": r.contractorCost,
    }));
    data.push({ Contractor: "TOTAL", "Work orders": "", "Tasks completed": "", "Tasks unpaid": contractorTotals.tasksUnpaid, "Contractor cost": contractorTotals.contractorCost });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Contractor pay");
    XLSX.writeFile(wb, "coverage-contractor-pay.xlsx");
  };
  const printReport = () => window.print();

  return (
    <div>
      <ViewHeader title="Reports" subtitle="Profit & loss on quotes, and what's owed to each contractor." />
      <div className="flex items-center gap-2 mb-4 no-print">
        <span className="text-sm" style={{ color: C.inkSoft }}>Outcome</span>
        <SelectInput className="w-44" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>{["All", "Open", "Accepted", "Lost", "Cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput>
        <span className="text-sm ml-2" style={{ color: C.inkSoft }}>Builder</span>
        <SelectInput className="w-48" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
          <option value="All">All builders</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectInput>
        <div className="flex-1" />
        <Button variant="outline" onClick={printReport}><Printer size={14} /> Export PDF</Button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium" style={{ color: C.ink }}>Job P&amp;L</div>
        <button onClick={exportJobPL} className="no-print text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Download size={13} /> Export Excel</button>
      </div>
      <div className="rounded-sm overflow-hidden mb-6 print-area" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Customer</Th><Th>Job type</Th><Th>Outcome</Th><ThN>Material</ThN><ThN>Labour</ThN><ThN>Subtotal</ThN><ThN>GST</ThN><ThN>Total</ThN><ThN>Profit</ThN><ThN>Margin</ThN></tr></thead>
          <tbody>{rows.map(({ p, t }) => (
            <tr key={p.id}><Td>{customerById[p.customerId]?.name || "—"}</Td><Td>{p.jobType}</Td><Td><Pill label={p.outcome} styleMap={OUTCOME_STYLES} /></Td>
              <TdN>{fmtCurrency(t.materialCost)}</TdN><TdN>{fmtCurrency(t.labourCost)}</TdN><TdN>{fmtCurrency(t.subtotal)}</TdN><TdN>{fmtCurrency(t.gst)}</TdN><TdN>{fmtCurrency(t.totalPayable)}</TdN>
              <TdN><span style={{ color: t.profit < 0 ? C.rust : C.green }}>{fmtCurrency(t.profit)}</span></TdN><TdN>{fmtPct(t.marginPct)}</TdN>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={10}><EmptyState text="No quotes match this filter." /></td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ background: C.card }}>
            <Td><span className="font-medium">Total</span></Td><Td></Td><Td></Td>
            <TdN><span className="font-medium">{fmtCurrency(totals.material)}</span></TdN><TdN><span className="font-medium">{fmtCurrency(totals.labour)}</span></TdN>
            <TdN><span className="font-medium">{fmtCurrency(totals.subtotal)}</span></TdN><TdN><span className="font-medium">{fmtCurrency(totals.gst)}</span></TdN><TdN><span className="font-medium">{fmtCurrency(totals.total)}</span></TdN>
            <TdN><span className="font-medium" style={{ color: totals.profit < 0 ? C.rust : C.green }}>{fmtCurrency(totals.profit)}</span></TdN><TdN><span className="font-medium">{fmtPct(totalMargin)}</span></TdN>
          </tr></tfoot>}
        </table>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium" style={{ color: C.ink }}>Contractor pay summary</div>
        <button onClick={exportContractors} className="no-print text-xs font-medium flex items-center gap-1" style={{ color: C.accent }}><Download size={13} /> Export Excel</button>
      </div>
      <div className="rounded-sm overflow-hidden print-area" style={{ border: `1px solid ${C.line}` }}>
        <table className="w-full"><thead style={{ background: C.card }}><tr><Th>Contractor</Th><ThN>Work orders</ThN><ThN>Tasks completed</ThN><ThN>Tasks unpaid</ThN><ThN>Contractor cost</ThN></tr></thead>
          <tbody>{contractorRows.map((r) => (
            <tr key={r.sub.id}><Td><span className="font-medium">{r.sub.name}</span></Td><TdN>{r.workOrderCount}</TdN><TdN>{r.tasksCompleted}</TdN>
              <TdN><span style={{ color: r.tasksUnpaid > 0 ? C.rust : C.inkSoft }}>{r.tasksUnpaid}</span></TdN>
              <TdN>{fmtCurrency(r.contractorCost)}</TdN>
            </tr>
          ))}
          {contractorRows.length === 0 && <tr><td colSpan={5}><EmptyState text="No work orders logged against any contractor yet." /></td></tr>}
          </tbody>
          {contractorRows.length > 0 && <tfoot><tr style={{ background: C.card }}>
            <Td><span className="font-medium">Total</span></Td><Td></Td><Td></Td>
            <TdN><span className="font-medium" style={{ color: contractorTotals.tasksUnpaid > 0 ? C.rust : C.inkSoft }}>{contractorTotals.tasksUnpaid}</span></TdN>
            <TdN><span className="font-medium">{fmtCurrency(contractorTotals.contractorCost)}</span></TdN>
          </tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
