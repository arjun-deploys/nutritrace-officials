/**
 * Demo geographies. District, division and block names are real places used
 * for orientation; every school, supplier, person and transaction is fictional.
 */
export interface BlockSpec { code: string; name: string; villages: string[] }
export interface DistrictSpec { code: string; name: string; lat: number; lng: number; division?: { code: string; name: string }; blocks: BlockSpec[] }
export interface SupplierSpec { code: string; name: string; commodities: string[]; district: string; status?: 'APPROVED' | 'PENDING_VERIFICATION' | 'SUSPENDED'; licenceExpired?: boolean }
export interface TenantSpec {
  code: string;
  seed: number;
  days: number;
  stateWarehouse: { name: string; lat: number; lng: number };
  districts: DistrictSpec[];
  schoolsPerBlock: number;
  suppliers: SupplierSpec[];
  scenarios: boolean;
  udisePrefix: string;
  schoolPrefixes: { primary: string; upper: string };
  persona: { districtCode: string; blockCode: string };
}

export const TENANT_SPECS: Record<string, TenantSpec> = {
  TN: {
    code: 'TN', seed: 3305, days: 21, udisePrefix: '33', schoolPrefixes: { primary: 'PUPS', upper: 'PUMS' },
    stateWarehouse: { name: 'State Central Warehouse, Ambattur', lat: 13.1143, lng: 80.1548 },
    schoolsPerBlock: 6, scenarios: true, persona: { districtCode: 'MDU', blockCode: 'MLR' },
    districts: [
      { code: 'CHN', name: 'Chennai', lat: 13.0827, lng: 80.2707, blocks: [
        { code: 'TND', name: 'Tondiarpet', villages: ['Kasimedu', 'Korukkupet', 'Old Washermenpet', 'Tondiarpet', 'Kaladipet', 'New Washermenpet'] },
        { code: 'MYL', name: 'Mylapore', villages: ['Mandaveli', 'Santhome', 'Royapettah', 'Alwarpet', 'Triplicane', 'Raja Annamalaipuram'] } ] },
      { code: 'CBE', name: 'Coimbatore', lat: 11.0168, lng: 76.9558, blocks: [
        { code: 'ANR', name: 'Annur', villages: ['Kanjapalli', 'Kariampalayam', 'Pogalur', 'Kattampatti', 'Ganesapuram', 'Vadakkalur'] },
        { code: 'PLN', name: 'Pollachi North', villages: ['Zamin Uthukuli', 'Kolarpatti', 'Kittasuramburam', 'Nallur', 'Thippampatti', 'Somandurai'] } ] },
      { code: 'MDU', name: 'Madurai', lat: 9.9252, lng: 78.1198, blocks: [
        { code: 'MLR', name: 'Melur', villages: ['Kottampatti', 'Thiruvathavur', 'Keelavalavu', 'Arittapatti', 'Kidaripatti', 'Narasingampatti'] },
        { code: 'TMG', name: 'Thirumangalam', villages: ['Kalligudi', 'Sivarakottai', 'Kappalur', 'Melakottai', 'Uchapatti', 'Ammapatti'] } ] },
      { code: 'TRY', name: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047, blocks: [
        { code: 'MNP', name: 'Manapparai', villages: ['Kovilpatti', 'Pudhupatti', 'Poigaipatti', 'Valanadu', 'Kalingapatti', 'Sengattupatti'] },
        { code: 'LGD', name: 'Lalgudi', villages: ['Pullambadi', 'Kallakudi', 'Poovalur', 'Anbil', 'Mangammalpuram', 'Kumulur'] } ] },
      { code: 'SLM', name: 'Salem', lat: 11.6643, lng: 78.146, blocks: [
        { code: 'OML', name: 'Omalur', villages: ['Kadayampatti', 'Karuppur', 'Thinnappatti', 'Pannapatti', 'Kamalapuram', 'Nallagoundampatti'] },
        { code: 'ATR', name: 'Attur', villages: ['Thalaivasal', 'Narasingapuram', 'Manjini', 'Kallanatham', 'Sathapadi', 'Kattukottai'] } ] },
      { code: 'TVL', name: 'Tirunelveli', lat: 8.7139, lng: 77.7567, blocks: [
        { code: 'PLK', name: 'Palayamkottai', villages: ['Perumalpuram', 'Melapalayam', 'Thiruvannathapuram', 'Reddiarpatti', 'Seevalaperi', 'Arugankulam'] },
        { code: 'ABS', name: 'Ambasamudram', villages: ['Vickramasingapuram', 'Kallidaikurichi', 'Papanasam', 'Alwarkurichi', 'Mannarkovil', 'Brammadesam'] } ] },
    ],
    suppliers: [
      { code: 'SUP-CAU', name: 'Cauvery Agro Foods Pvt Ltd', commodities: ['RICE', 'RAGI', 'RAVA'], district: 'Thanjavur' },
      { code: 'SUP-VAI', name: 'Vaigai Pulses & Grains', commodities: ['TOOR', 'MOONG', 'CHANA'], district: 'Virudhunagar' },
      { code: 'SUP-KON', name: 'Kongu Poultry Producers Co-operative', commodities: ['EGG'], district: 'Namakkal' },
      { code: 'SUP-MAR', name: 'Marudham Oil Mills', commodities: ['OIL', 'SALT'], district: 'Thoothukudi' },
      { code: 'SUP-THA', name: 'Thamirabarani Fresh Produce FPO', commodities: ['VEG'], district: 'Tirunelveli' },
      { code: 'SUP-SLT', name: 'Sri Lakshmi Traders', commodities: ['TOOR', 'RICE'], district: 'Madurai', status: 'PENDING_VERIFICATION', licenceExpired: true },
    ],
  },
  KA: {
    code: 'KA', seed: 2901, days: 14, udisePrefix: '29', schoolPrefixes: { primary: 'GLPS', upper: 'GHPS' },
    stateWarehouse: { name: 'State Warehouse, Yeshwanthpur', lat: 13.0285, lng: 77.5401 },
    schoolsPerBlock: 4, scenarios: false, persona: { districtCode: 'MYS', blockCode: 'HNS' },
    districts: [
      { code: 'MYS', name: 'Mysuru', lat: 12.2958, lng: 76.6394, blocks: [
        { code: 'HNS', name: 'Hunsur', villages: ['Bilikere', 'Hanagodu', 'Gavadagere', 'Dharmapura'] },
        { code: 'NJG', name: 'Nanjangud', villages: ['Hullahalli', 'Hadinaru', 'Kalale', 'Biligere'] } ] },
      { code: 'DWD', name: 'Dharwad', lat: 15.4589, lng: 75.0078, blocks: [
        { code: 'KLG', name: 'Kalghatgi', villages: ['Tabakadahonnalli', 'Dummawad', 'Mishrikoti', 'Gambyapur'] },
        { code: 'NVL', name: 'Navalgund', villages: ['Annigeri', 'Morab', 'Alagawadi', 'Shalawadi'] } ] },
    ],
    suppliers: [
      { code: 'SUP-KRS', name: 'Kaveri Grains Pvt Ltd', commodities: ['RICE', 'RAGI', 'RAVA'], district: 'Mandya' },
      { code: 'SUP-TNG', name: 'Tungabhadra Pulses', commodities: ['TOOR', 'MOONG', 'CHANA', 'OIL', 'SALT'], district: 'Kalaburagi' },
      { code: 'SUP-MLK', name: 'Malnad Farmers Producer Co.', commodities: ['EGG', 'VEG'], district: 'Shivamogga' },
    ],
  },
  UP: {
    code: 'UP', seed: 909, days: 14, udisePrefix: '09', schoolPrefixes: { primary: 'PS', upper: 'UPS' },
    stateWarehouse: { name: 'State Food Store, Lucknow', lat: 26.8467, lng: 80.9462 },
    schoolsPerBlock: 4, scenarios: false, persona: { districtCode: 'LKO', blockCode: 'BKT' },
    districts: [
      { code: 'LKO', name: 'Lucknow', lat: 26.8467, lng: 80.9462, division: { code: 'LKD', name: 'Lucknow division' }, blocks: [
        { code: 'BKT', name: 'Bakshi Ka Talab', villages: ['Itaunja', 'Mahona', 'Kathwara', 'Bhauli'] },
        { code: 'MAL', name: 'Malihabad', villages: ['Rahimabad', 'Mal', 'Kasmandi', 'Ataria'] } ] },
      { code: 'VNS', name: 'Varanasi', lat: 25.3176, lng: 82.9739, division: { code: 'VND', name: 'Varanasi division' }, blocks: [
        { code: 'ARJ', name: 'Arajiline', villages: ['Mehdiganj', 'Rajatalab', 'Bhikharipur', 'Kapsethi'] },
        { code: 'PDR', name: 'Pindra', villages: ['Phulpur', 'Babatpur', 'Bariyasanpur', 'Karkhiyaon'] } ] },
    ],
    suppliers: [
      { code: 'SUP-GNG', name: 'Ganga Grains & Pulses Ltd', commodities: ['RICE', 'RAVA', 'TOOR', 'MOONG', 'CHANA', 'RAGI'], district: 'Kanpur Nagar' },
      { code: 'SUP-AWD', name: 'Awadh Agro Producer Co.', commodities: ['EGG', 'VEG', 'OIL', 'SALT'], district: 'Barabanki' },
    ],
  },
};

export const RECIPES = [
  { code: 'L-SAMBAR', name: 'Sambar rice with egg', mealType: 'LUNCH', description: 'Rice, toor dal sambar with vegetables, boiled egg', ing: { RICE: [0.1, 0.15], TOOR: [0.02, 0.03], VEG: [0.05, 0.075], OIL: [0.005, 0.0075], EGG: [1, 1], SALT: [0.002, 0.003] } },
  { code: 'L-PULAO', name: 'Vegetable pulao with chana', mealType: 'LUNCH', description: 'Vegetable pulao, black chana masala, boiled egg', ing: { RICE: [0.1, 0.15], CHANA: [0.02, 0.03], VEG: [0.05, 0.075], OIL: [0.005, 0.0075], EGG: [1, 1], SALT: [0.002, 0.003] } },
  { code: 'L-KEERAI', name: 'Keerai sadam with moong dal', mealType: 'LUNCH', description: 'Greens rice with moong dal, boiled egg', ing: { RICE: [0.1, 0.15], MOONG: [0.02, 0.03], VEG: [0.05, 0.075], OIL: [0.005, 0.0075], EGG: [1, 1], SALT: [0.002, 0.003] } },
  { code: 'B-UPMA', name: 'Rava upma with sambar', mealType: 'BREAKFAST', description: 'Semolina upma with vegetable sambar', ing: { RAVA: [0.05, 0.06], TOOR: [0.01, 0.012], VEG: [0.03, 0.035], OIL: [0.004, 0.005], SALT: [0.001, 0.001] } },
  { code: 'B-PONGAL', name: 'Ven pongal with sambar', mealType: 'BREAKFAST', description: 'Rice and moong dal pongal with sambar', ing: { RICE: [0.045, 0.055], MOONG: [0.015, 0.018], VEG: [0.02, 0.025], OIL: [0.005, 0.006], SALT: [0.001, 0.001] } },
  { code: 'B-RAGI', name: 'Ragi kichadi', mealType: 'BREAKFAST', description: 'Finger millet kichadi with moong dal and vegetables', ing: { RAGI: [0.055, 0.065], MOONG: [0.012, 0.015], VEG: [0.03, 0.035], OIL: [0.004, 0.005], SALT: [0.001, 0.001] } },
] as const;

export const MENU: Record<'LUNCH' | 'BREAKFAST', string[]> = {
  // index = dayOfWeek (0 = Sunday)
  LUNCH: ['L-SAMBAR', 'L-SAMBAR', 'L-PULAO', 'L-KEERAI', 'L-SAMBAR', 'L-PULAO', 'L-KEERAI'],
  BREAKFAST: ['B-UPMA', 'B-UPMA', 'B-PONGAL', 'B-RAGI', 'B-UPMA', 'B-PONGAL', 'B-RAGI'],
};
