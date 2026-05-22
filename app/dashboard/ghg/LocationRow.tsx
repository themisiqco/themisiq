"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationData {
  id: string;
  name: string;
  country: string;
  state?: string;          // US states
  province?: string;       // Canadian provinces
  region?: string;         // free-text for other countries
  gridRegion: string;
  electricityKwh: number;
  naturalGasGj: number;
  otherFuelGj: number;
  // GHG Protocol metadata
  emissionFactor: number;       // kg CO₂e / kWh
  factorSource: string;         // e.g. "EPA eGRID 2023", "NIR 2023", "IEA 2022"
  factorYear: number;
  method: "location-based" | "market-based";
  // Market-based (optional, only if method = market-based)
  marketFactor?: number;
  marketInstrument?: string;    // "REC", "PPA", "Supplier-specific", "GOs"
}

// ─── Emission Factor Data ─────────────────────────────────────────────────────

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
  NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon",
};

// eGRID 2023 subregion factors (kg CO₂e / kWh) — location-based
const EGRID_FACTORS: Record<string, { region: string; factor: number }> = {
  CA: { region: "WECC California (CAMX)", factor: 0.196 },
  OR: { region: "WECC Northwest (NWPP)", factor: 0.121 },
  WA: { region: "WECC Northwest (NWPP)", factor: 0.121 },
  TX: { region: "ERCOT (ERCT)", factor: 0.391 },
  NY: { region: "NPCC NYC/Westchester (NYCW)", factor: 0.219 },
  FL: { region: "FRCC", factor: 0.407 },
  IL: { region: "SERC Illinois (SRTV)", factor: 0.399 },
  OH: { region: "RFC East (RFCE)", factor: 0.403 },
  PA: { region: "RFC East (RFCE)", factor: 0.403 },
  NJ: { region: "RFC East (RFCE)", factor: 0.403 },
  MA: { region: "NPCC New England (NEWE)", factor: 0.281 },
  CT: { region: "NPCC New England (NEWE)", factor: 0.281 },
  RI: { region: "NPCC New England (NEWE)", factor: 0.281 },
  CO: { region: "WECC Rockies (RMPA)", factor: 0.494 },
  AZ: { region: "WECC Southwest (AZNM)", factor: 0.388 },
  NV: { region: "WECC Southwest (AZNM)", factor: 0.388 },
  GA: { region: "SERC Southeast (SRSE)", factor: 0.402 },
  NC: { region: "SERC Southeast (SRSE)", factor: 0.402 },
  VA: { region: "SERC Southeast (SRSE)", factor: 0.402 },
  MI: { region: "RFC Michigan (RFCM)", factor: 0.479 },
  MN: { region: "MRO Upper Midwest (MROW)", factor: 0.444 },
  WI: { region: "MRO Upper Midwest (MROW)", factor: 0.444 },
};

const DEFAULT_EGRID = { region: "US Average (eGRID 2023)", factor: 0.386 };

// Canadian NIR 2023 provincial factors (kg CO₂e / kWh)
const CA_PROVINCE_FACTORS: Record<string, { region: string; factor: number }> = {
  AB: { region: "Alberta Grid (AESO)", factor: 0.540 },
  BC: { region: "BC Hydro Grid", factor: 0.013 },
  MB: { region: "Manitoba Hydro Grid", factor: 0.002 },
  NB: { region: "NB Power Grid", factor: 0.316 },
  NL: { region: "Newfoundland Grid", factor: 0.024 },
  NS: { region: "Nova Scotia Grid", factor: 0.690 },
  NT: { region: "Northwest Territories Grid", factor: 0.226 },
  NU: { region: "Nunavut Grid", factor: 0.800 },
  ON: { region: "IESO Ontario Grid", factor: 0.040 },
  PE: { region: "PEI Grid", factor: 0.306 },
  QC: { region: "Hydro-Québec Grid", factor: 0.002 },
  SK: { region: "SaskPower Grid", factor: 0.742 },
  YT: { region: "Yukon Grid", factor: 0.088 },
};

// IEA 2022 national factors for select countries (kg CO₂e / kWh)
const IEA_FACTORS: Record<string, number> = {
  GB: 0.233, DE: 0.412, FR: 0.085, NL: 0.392, SE: 0.046,
  NO: 0.028, DK: 0.166, IE: 0.295, ES: 0.189, IT: 0.347,
  PL: 0.773, AU: 0.610, NZ: 0.127, JP: 0.474, KR: 0.459,
  CN: 0.581, IN: 0.713, BR: 0.075, MX: 0.454, ZA: 0.928,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function getAutoFactor(
  country: string,
  stateOrProvince: string
): { factor: number; region: string; source: string; year: number } | null {
  if (country === "US") {
    const egrid = EGRID_FACTORS[stateOrProvince] || DEFAULT_EGRID;
    return { factor: egrid.factor, region: egrid.region, source: "EPA eGRID 2023", year: 2023 };
  }
  if (country === "CA") {
    const prov = CA_PROVINCE_FACTORS[stateOrProvince];
    if (prov) return { factor: prov.factor, region: prov.region, source: "Environment Canada NIR 2023", year: 2023 };
  }
  const iea = IEA_FACTORS[country];
  if (iea) return { factor: iea, region: "National average", source: "IEA 2022", year: 2022 };
  return null;
}

// ─── Country List ─────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "IE", name: "Ireland" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PL", name: "Poland" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
  { code: "OTHER", name: "Other country…" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const BRAND_GRADIENT = "linear-gradient(135deg, #7425e3, #1fb1ff, #64fe3e)";

const s = {
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 16,
    position: "relative" as const,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: "#6b7280",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 14,
    color: "#111827",
    background: "white",
    boxSizing: "border-box" as const,
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 14,
    color: "#111827",
    background: "white",
    boxSizing: "border-box" as const,
    outline: "none",
    cursor: "pointer",
  },
  factorBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    marginTop: 4,
  },
  warnBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: "#fffbeb",
    color: "#92400e",
    border: "1px solid #fde68a",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#9ca3af",
    marginBottom: 10,
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    borderTop: "1px solid #f3f4f6",
    margin: "16px 0",
  },
  removeBtn: {
    position: "absolute" as const,
    top: 16,
    right: 16,
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 4,
    borderRadius: 4,
  },
  methodToggle: {
    display: "flex",
    gap: 0,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  methodBtn: (active: boolean) => ({
    flex: 1,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    background: active ? "#7425e3" : "white",
    color: active ? "white" : "#6b7280",
    transition: "all 0.15s",
  }),
  hint: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
    lineHeight: 1.5,
  },
};

// ─── LocationRow Component ────────────────────────────────────────────────────

interface LocationRowProps {
  location: LocationData;
  index: number;
  onChange: (updated: LocationData) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function LocationRow({ location, index, onChange, onRemove, canRemove }: LocationRowProps) {
  const [showMarketFields, setShowMarketFields] = useState(location.method === "market-based");

  const update = (patch: Partial<LocationData>) => onChange({ ...location, ...patch });

  // Auto-fill emission factor when country/state/province changes
  useEffect(() => {
    const subRegion = location.country === "US" ? location.state :
                      location.country === "CA" ? location.province : "";
    if (!subRegion && location.country !== "US" && location.country !== "CA") {
      // IEA country-level
      const auto = getAutoFactor(location.country, "");
      if (auto) {
        update({
          emissionFactor: auto.factor,
          gridRegion: auto.region,
          factorSource: auto.source,
          factorYear: auto.year,
        });
      }
      return;
    }
    if (subRegion) {
      const auto = getAutoFactor(location.country, subRegion);
      if (auto) {
        update({
          emissionFactor: auto.factor,
          gridRegion: auto.region,
          factorSource: auto.source,
          factorYear: auto.year,
        });
      }
    }
  }, [location.country, location.state, location.province]);

  const handleMethodToggle = (method: "location-based" | "market-based") => {
    setShowMarketFields(method === "market-based");
    update({ method });
  };

  const isAutoFactor = location.factorSource.includes("eGRID") ||
                        location.factorSource.includes("NIR") ||
                        location.factorSource.includes("IEA");
  const isManualFactor = !isAutoFactor && location.factorSource === "Manual entry";
  const isOtherCountry = location.country === "OTHER" || (
    location.country !== "US" && location.country !== "CA" && !IEA_FACTORS[location.country]
  );

  return (
    <div style={s.card}>
      {canRemove && (
        <button style={s.removeBtn} onClick={onRemove} aria-label="Remove location">×</button>
      )}

      {/* Location header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: BRAND_GRADIENT,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "white", flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <input
          style={{ ...s.input, fontWeight: 600, fontSize: 15, border: "none", padding: "0 4px", flex: 1 }}
          value={location.name}
          onChange={e => update({ name: e.target.value })}
          placeholder={`Location ${index + 1} — e.g. "Toronto HQ" or "Austin Data Center"`}
        />
      </div>

      {/* Geography */}
      <div style={s.row}>
        {/* Country */}
        <div>
          <label style={s.label}>Country</label>
          <select
            style={s.select}
            value={location.country}
            onChange={e => update({
              country: e.target.value,
              state: undefined,
              province: undefined,
              region: undefined,
              gridRegion: "",
              emissionFactor: 0,
              factorSource: "",
              factorYear: new Date().getFullYear() - 1,
            })}
          >
            <option value="">Select country…</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* US State */}
        {location.country === "US" && (
          <div>
            <label style={s.label}>State</label>
            <select
              style={s.select}
              value={location.state || ""}
              onChange={e => update({ state: e.target.value })}
            >
              <option value="">Select state…</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Canadian Province */}
        {location.country === "CA" && (
          <div>
            <label style={s.label}>Province / Territory</label>
            <select
              style={s.select}
              value={location.province || ""}
              onChange={e => update({ province: e.target.value })}
            >
              <option value="">Select province…</option>
              {Object.entries(CA_PROVINCES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Other country free text */}
        {location.country && location.country !== "US" && location.country !== "CA" && (
          <div>
            <label style={s.label}>State / Region</label>
            <input
              style={s.input}
              value={location.region || ""}
              onChange={e => update({ region: e.target.value })}
              placeholder="e.g. Bavaria, New South Wales"
            />
          </div>
        )}
      </div>

      {/* Grid region (auto-populated, read-only unless manual) */}
      {location.gridRegion && (
        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Grid region</label>
          <div style={{ fontSize: 13, color: "#374151", padding: "2px 0" }}>{location.gridRegion}</div>
        </div>
      )}

      <div style={s.divider} />

      {/* Energy data */}
      <div style={s.sectionTitle}>
        <span>⚡</span> Energy & fuel data
      </div>

      <div style={s.row}>
        <div>
          <label style={s.label}>Electricity (kWh/yr)</label>
          <input
            type="number"
            style={s.input}
            value={location.electricityKwh || ""}
            onChange={e => update({ electricityKwh: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            min="0"
          />
        </div>
        <div>
          <label style={s.label}>Natural gas (GJ/yr)</label>
          <input
            type="number"
            style={s.input}
            value={location.naturalGasGj || ""}
            onChange={e => update({ naturalGasGj: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            min="0"
          />
        </div>
        <div>
          <label style={s.label}>Other fuel (GJ/yr)</label>
          <input
            type="number"
            style={s.input}
            value={location.otherFuelGj || ""}
            onChange={e => update({ otherFuelGj: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            min="0"
          />
        </div>
      </div>

      <div style={s.divider} />

      {/* GHG Protocol emission factor section */}
      <div style={s.sectionTitle}>
        <span>📋</span> Emission factor — GHG Protocol compliant
      </div>

      {/* Method toggle */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ ...s.label, marginBottom: 6 }}>Scope 2 accounting method</label>
        <div style={s.methodToggle}>
          <button
            style={s.methodBtn(location.method === "location-based")}
            onClick={() => handleMethodToggle("location-based")}
          >
            Location-based
          </button>
          <button
            style={s.methodBtn(location.method === "market-based")}
            onClick={() => handleMethodToggle("market-based")}
          >
            Market-based
          </button>
        </div>
        <div style={s.hint}>
          {location.method === "location-based"
            ? "Uses regional grid average. GHG Protocol requires both methods to be reported."
            : "Uses contractual instruments (RECs, PPAs, supplier tariffs). Requires location-based too."}
        </div>
      </div>

      {/* Location-based factor */}
      <div style={s.row}>
        <div>
          <label style={s.label}>Emission factor (kg CO₂e / kWh)</label>
          <input
            type="number"
            style={s.input}
            value={location.emissionFactor || ""}
            onChange={e => update({ emissionFactor: parseFloat(e.target.value) || 0, factorSource: "Manual entry" })}
            placeholder="Auto-filled from grid data"
            step="0.001"
            min="0"
          />
          {isAutoFactor && (
            <div style={s.factorBadge}>
              ✓ Auto-filled · {location.factorSource}
            </div>
          )}
          {isManualFactor && (
            <div style={s.warnBadge}>
              ⚠ Manual entry — document your source
            </div>
          )}
          {isOtherCountry && !location.emissionFactor && (
            <div style={s.warnBadge}>
              No auto factor available — enter manually
            </div>
          )}
        </div>

        <div>
          <label style={s.label}>Factor source</label>
          <input
            style={s.input}
            value={location.factorSource || ""}
            onChange={e => update({ factorSource: e.target.value })}
            placeholder="e.g. EPA eGRID 2023, IEA 2022"
          />
          <div style={s.hint}>Required for assurance readiness</div>
        </div>

        <div>
          <label style={s.label}>Factor year</label>
          <select
            style={s.select}
            value={location.factorYear || ""}
            onChange={e => update({ factorYear: parseInt(e.target.value) })}
          >
            <option value="">Select…</option>
            {[2024, 2023, 2022, 2021, 2020].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div style={s.hint}>Use most recent available</div>
        </div>
      </div>

      {/* Market-based fields */}
      {showMarketFields && (
        <>
          <div style={{ ...s.sectionTitle, marginTop: 12 }}>
            <span>📄</span> Market-based instrument
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Instrument type</label>
              <select
                style={s.select}
                value={location.marketInstrument || ""}
                onChange={e => update({ marketInstrument: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="REC">REC (Renewable Energy Certificate)</option>
                <option value="PPA">PPA (Power Purchase Agreement)</option>
                <option value="GO">GO (Guarantee of Origin) — EU</option>
                <option value="Supplier-tariff">Supplier-specific tariff</option>
                <option value="None">No instrument — use residual mix</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Market factor (kg CO₂e / kWh)</label>
              <input
                type="number"
                style={s.input}
                value={location.marketFactor || ""}
                onChange={e => update({ marketFactor: parseFloat(e.target.value) || 0 })}
                placeholder="0 for 100% renewable"
                step="0.001"
                min="0"
              />
              <div style={s.hint}>0 = fully covered by instrument</div>
            </div>
          </div>
        </>
      )}

      {/* Assurance readiness indicator */}
      {location.emissionFactor > 0 && location.factorSource && location.factorYear && (
        <div style={{
          marginTop: 16,
          padding: "10px 14px",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "#166534",
          fontWeight: 500,
        }}>
          ✓ Assurance-ready · Factor documented with source and year
        </div>
      )}
    </div>
  );
}

// ─── LocationsSection Component (container used in GHG wizard) ───────────────

function newLocation(overrides?: Partial<LocationData>): LocationData {
  return {
    id: crypto.randomUUID(),
    name: "",
    country: "",
    state: undefined,
    province: undefined,
    region: undefined,
    gridRegion: "",
    electricityKwh: 0,
    naturalGasGj: 0,
    otherFuelGj: 0,
    emissionFactor: 0,
    factorSource: "",
    factorYear: 2023,
    method: "location-based",
    ...overrides,
  };
}

export default function LocationsSection({
  value,
  onChange,
}: {
  value: LocationData[];
  onChange: (locs: LocationData[]) => void;
}) {
  const add = () => onChange([...value, newLocation()]);
  const remove = (id: string) => onChange(value.filter(l => l.id !== id));
  const update = (id: string, updated: LocationData) =>
    onChange(value.map(l => (l.id === id ? updated : l)));

  return (
    <div>
      {value.map((loc, i) => (
        <LocationRow
          key={loc.id}
          location={loc}
          index={i}
          onChange={updated => update(loc.id, updated)}
          onRemove={() => remove(loc.id)}
          canRemove={value.length > 1}
        />
      ))}

      <button
        onClick={add}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          border: "1.5px dashed #d1d5db",
          borderRadius: 10,
          background: "transparent",
          color: "#6b7280",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          width: "100%",
          justifyContent: "center",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.borderColor = "#7425e3";
          (e.target as HTMLElement).style.color = "#7425e3";
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.borderColor = "#d1d5db";
          (e.target as HTMLElement).style.color = "#6b7280";
        }}
      >
        + Add another location
      </button>
    </div>
  );
}

// ─── Usage example (shows initial state for wizard) ──────────────────────────
// In app/dashboard/ghg/page.tsx, replace your locations state with:
//
// const [locations, setLocations] = useState<LocationData[]>([newLocation()]);
// ...
// <LocationsSection value={locations} onChange={setLocations} />
//
// When saving to Supabase, locations already serializes cleanly to JSONB:
// locations_data: locations
