import type { CommodityCreateInput, TenantConfig } from './schemas/registry';

/**
 * Onboarding pack. A new state is configured from a preset — hierarchy names,
 * languages, programmes and norms — not by changing code. Every value here is a
 * starting point to be confirmed with the state's nodal department.
 */
export interface StatePreset {
  code: string;
  name: string;
  hierarchyLevels: string[];
  languages: string[];
  programmes: TenantConfig['programmes'];
  districts?: string[];
}

const PM_POSHAN = { code: 'PMPOSHAN', name: 'PM POSHAN (mid-day meal)', mealTypes: ['LUNCH'] as const };

export const STATE_PRESETS: StatePreset[] = [
  {
    code: 'TN', name: 'Tamil Nadu', hierarchyLevels: ['State', 'District', 'Block'], languages: ['en', 'ta'],
    programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }, { code: 'CMBS', name: "Chief Minister's Breakfast Scheme", mealTypes: ['BREAKFAST'] }],
    districts: [
      'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram',
      'Kanniyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
      'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
      'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
    ],
  },
  { code: 'KA', name: 'Karnataka', hierarchyLevels: ['State', 'District', 'Taluk'], languages: ['en', 'kn'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }, { code: 'MILK', name: 'School milk programme', mealTypes: ['SNACK'] }] },
  { code: 'UP', name: 'Uttar Pradesh', hierarchyLevels: ['State', 'Division', 'District', 'Block'], languages: ['en', 'hi'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }] },
  { code: 'MH', name: 'Maharashtra', hierarchyLevels: ['State', 'Division', 'District', 'Taluka'], languages: ['en', 'mr'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }] },
  { code: 'AP', name: 'Andhra Pradesh', hierarchyLevels: ['State', 'District', 'Mandal'], languages: ['en', 'te'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }, { code: 'BFAST', name: 'State breakfast scheme', mealTypes: ['BREAKFAST'] }] },
  { code: 'TG', name: 'Telangana', hierarchyLevels: ['State', 'District', 'Mandal'], languages: ['en', 'te'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }, { code: 'BFAST', name: 'State breakfast scheme', mealTypes: ['BREAKFAST'] }] },
  { code: 'KL', name: 'Kerala', hierarchyLevels: ['State', 'District', 'Block'], languages: ['en', 'ml'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }] },
  { code: 'OD', name: 'Odisha', hierarchyLevels: ['State', 'District', 'Block'], languages: ['en', 'or'], programmes: [{ ...PM_POSHAN, mealTypes: ['LUNCH'] }] },
];

/**
 * PM POSHAN energy/protein norms for lunch are national. Breakfast and snack
 * norms are placeholders until the state confirms its own scheme norms.
 */
export const DEFAULT_NORMS: TenantConfig['nutritionNorms'] = [
  { schoolCategory: 'PRIMARY', mealType: 'LUNCH', energyKcal: 450, proteinG: 12 },
  { schoolCategory: 'UPPER_PRIMARY', mealType: 'LUNCH', energyKcal: 700, proteinG: 20 },
  { schoolCategory: 'PRIMARY', mealType: 'BREAKFAST', energyKcal: 290, proteinG: 7 },
  { schoolCategory: 'UPPER_PRIMARY', mealType: 'BREAKFAST', energyKcal: 330, proteinG: 8 },
  { schoolCategory: 'PRIMARY', mealType: 'SNACK', energyKcal: 120, proteinG: 4 },
  { schoolCategory: 'UPPER_PRIMARY', mealType: 'SNACK', energyKcal: 150, proteinG: 5 },
];

export function defaultTenantConfig(preset: StatePreset): TenantConfig {
  return {
    hierarchyLevels: preset.hierarchyLevels,
    languages: preset.languages,
    programmes: preset.programmes,
    operatingDays: [1, 2, 3, 4, 5, 6],
    thresholds: {
      lowStockDaysOfCover: 7,
      expiryWarningDays: 30,
      receiptVarianceTolerancePct: 0.5,
      wastageTolerancePct: 8,
      shipmentDelayGraceHours: 6,
      schoolReportCutoffHour: 15,
    },
    nutritionNorms: DEFAULT_NORMS,
  };
}

const IFCT = 'IFCT 2017 (NIN) approximation — verify before go-live';
/** Starter catalogue. Values per 100 g edible portion. */
export const DEFAULT_COMMODITIES: CommodityCreateInput[] = [
  { code: 'RICE', name: 'Rice, raw (Grade A)', localNames: { ta: 'அரிசி', hi: 'चावल' }, category: 'CEREAL', unit: 'KG', shelfLifeDays: 365, storage: 'Dry, off-floor, fumigated store', specification: 'FCI Grade A, moisture ≤ 14%', nutritionPer100: { energyKcal: 356, proteinG: 7.9, fatG: 0.5, carbsG: 78.2, ironMg: 0.7, calciumMg: 7.5 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'TOOR', name: 'Toor dal (split red gram)', localNames: { ta: 'துவரம் பருப்பு', hi: 'अरहर दाल' }, category: 'PULSE', unit: 'KG', shelfLifeDays: 270, storage: 'Dry, airtight bins', specification: 'FAQ grade, moisture ≤ 10%', nutritionPer100: { energyKcal: 343, proteinG: 22.3, fatG: 1.7, carbsG: 57.6, ironMg: 2.7, calciumMg: 73 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'MOONG', name: 'Moong dal (split green gram)', localNames: { ta: 'பாசிப் பருப்பு', hi: 'मूंग दाल' }, category: 'PULSE', unit: 'KG', shelfLifeDays: 270, storage: 'Dry, airtight bins', nutritionPer100: { energyKcal: 348, proteinG: 24.5, fatG: 1.2, carbsG: 59.9, ironMg: 3.9, calciumMg: 75 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'CHANA', name: 'Black chana (Bengal gram, whole)', localNames: { ta: 'கொண்டைக்கடலை', hi: 'काला चना' }, category: 'PULSE', unit: 'KG', shelfLifeDays: 365, nutritionPer100: { energyKcal: 360, proteinG: 17.1, fatG: 5.3, carbsG: 60.9, ironMg: 4.6, calciumMg: 202 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'RAVA', name: 'Rava (semolina)', localNames: { ta: 'ரவை', hi: 'सूजी' }, category: 'CEREAL', unit: 'KG', shelfLifeDays: 120, nutritionPer100: { energyKcal: 348, proteinG: 10.4, fatG: 0.8, carbsG: 74.8, ironMg: 1.6, calciumMg: 16 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'RAGI', name: 'Ragi flour (finger millet)', localNames: { ta: 'கேழ்வரகு', kn: 'ರಾಗಿ' }, category: 'MILLET', unit: 'KG', shelfLifeDays: 120, nutritionPer100: { energyKcal: 328, proteinG: 7.3, fatG: 1.3, carbsG: 72, ironMg: 3.9, calciumMg: 344 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'EGG', name: 'Egg (hen, ~50 g)', localNames: { ta: 'முட்டை', hi: 'अंडा' }, category: 'EGG', unit: 'PIECE', shelfLifeDays: 14, storage: 'Cool, ventilated trays', nutritionPer100: { energyKcal: 173, proteinG: 13.3, fatG: 13.3, carbsG: 0, ironMg: 2.1, calciumMg: 60 }, gramsPerUnit: 50, nutritionSource: IFCT },
  { code: 'OIL', name: 'Groundnut oil (refined)', localNames: { ta: 'கடலை எண்ணெய்' }, category: 'OIL', unit: 'LITRE', shelfLifeDays: 270, nutritionPer100: { energyKcal: 900, proteinG: 0, fatG: 100, carbsG: 0, ironMg: 0, calciumMg: 0 }, gramsPerUnit: 910, nutritionSource: IFCT },
  { code: 'VEG', name: 'Vegetables, mixed seasonal', localNames: { ta: 'காய்கறிகள்' }, category: 'VEGETABLE', unit: 'KG', shelfLifeDays: 4, storage: 'Shade, used within 3 days', nutritionPer100: { energyKcal: 40, proteinG: 2, fatG: 0.3, carbsG: 7, ironMg: 1, calciumMg: 30 }, gramsPerUnit: 1000, nutritionSource: IFCT },
  { code: 'SALT', name: 'Salt, double-fortified', localNames: { ta: 'உப்பு' }, category: 'CONDIMENT', unit: 'KG', shelfLifeDays: 365, nutritionPer100: { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, ironMg: 100, calciumMg: 0 }, gramsPerUnit: 1000, nutritionSource: 'Fortification standard (FSSAI) — verify' },
];
