// f — molar mass ratio CO2/C. IR 2025/2547 Annex II, Eq 12. One definition, never inlined.
export const CO2_C_RATIO = 3.664;

// EU member states + EEA/exempted countries and territories whose precursors are zero-rated
// under CBAM (Eq 60 rule / Annex III point 1 of Reg 2023/956). Static regulation.
export const EU_AND_EXEMPTED = new Set<string>([
  // EU-27
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','EL','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  // EEA / exempted (own ETS)
  'IS','LI','NO','CH',
  // exempted territories
  'XCEUTA','XMELILLA','XLIVIGNO','XHELIGOLAND','XBUSINGEN',
]);
