import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Shell vocabulary in each state language. Page copy is English-first and is
 * translated per state during rollout (keys follow `area.item`).
 */
const resources = {
  en: { translation: {
    nav: { group: { home: 'My desk', lastMile: 'Last mile', monitor: 'Monitor', supply: 'Supply chain', meals: 'Meals', assure: 'Assurance', admin: 'Administration' },
      work: 'My work', indents: 'Indents', lastMile: 'Last mile', overview: 'Command centre', trace: 'Track & trace', exceptions: 'Exceptions', procurement: 'Procurement', inventory: 'Inventory', logistics: 'Shipments',
      kitchen: 'Kitchen', schools: 'Schools', nutrition: 'Menus & nutrition', quality: 'Inspections', recalls: 'Recalls', reports: 'Reports',
      locations: 'Locations', commodities: 'Food items', vehicles: 'Vehicles', facilities: 'Facilities', suppliers: 'Suppliers', users: 'Users & roles', config: 'Programme settings', audit: 'Audit trail', console: 'Admin Console' },
    shell: { search: 'Find a lot, shipment or school', online: 'Online', offline: 'Offline — entries are saved on this device', pending: '{{count}} waiting to sync', signOut: 'Sign out', account: 'My account', theme: 'Dark mode', language: 'Language', notifications: 'Notifications', allCaughtUp: 'You are all caught up', scope: 'Viewing', wholeState: 'Whole state' },
  } },
  ta: { translation: {
    nav: { group: { home: 'என் பணி', lastMile: 'கடைசி மைல்', monitor: 'கண்காணிப்பு', supply: 'விநியோகச் சங்கிலி', meals: 'உணவு', assure: 'தர உறுதி', admin: 'நிர்வாகம்' },
      work: 'என் பணிகள்', indents: 'கோரிக்கைகள்', lastMile: 'கடைசி மைல் விநியோகம்', overview: 'கட்டுப்பாட்டு மையம்', trace: 'கண்காணிப்பு & கண்டறிதல்', exceptions: 'விதிவிலக்குகள்', procurement: 'கொள்முதல்', inventory: 'இருப்பு', logistics: 'சரக்கு அனுப்புதல்',
      kitchen: 'சமையலறை', schools: 'பள்ளிகள்', nutrition: 'உணவுப் பட்டியல் & ஊட்டச்சத்து', quality: 'ஆய்வுகள்', recalls: 'திரும்பப் பெறுதல்', reports: 'அறிக்கைகள்',
      locations: 'இடங்கள்', commodities: 'உணவுப் பொருட்கள்', vehicles: 'வாகனங்கள்', facilities: 'நிலையங்கள்', suppliers: 'வழங்குநர்கள்', users: 'பயனர்கள்', config: 'திட்ட அமைப்புகள்', audit: 'தணிக்கைப் பதிவு', console: 'நிர்வாக மையம்' },
    shell: { search: 'லாட், சரக்கு அல்லது பள்ளியைத் தேடுக', online: 'இணைப்பில் உள்ளது', offline: 'இணைப்பு இல்லை — பதிவுகள் இந்தச் சாதனத்தில் சேமிக்கப்படுகின்றன', pending: '{{count}} ஒத்திசைவுக்குக் காத்திருக்கின்றன', signOut: 'வெளியேறு', account: 'என் கணக்கு', theme: 'இருண்ட பயன்முறை', language: 'மொழி', notifications: 'அறிவிப்புகள்', allCaughtUp: 'புதிய அறிவிப்புகள் இல்லை', scope: 'பார்வை', wholeState: 'முழு மாநிலம்' },
  } },
  hi: { translation: {
    nav: { group: { home: 'मेरा डेस्क', lastMile: 'अंतिम मील', monitor: 'निगरानी', supply: 'आपूर्ति श्रृंखला', meals: 'भोजन', assure: 'गुणवत्ता आश्वासन', admin: 'प्रशासन' },
      work: 'मेरे काम', indents: 'इंडेंट', lastMile: 'अंतिम मील', overview: 'कमांड सेंटर', trace: 'ट्रैक और ट्रेस', exceptions: 'अपवाद', procurement: 'खरीद', inventory: 'भंडार', logistics: 'शिपमेंट',
      kitchen: 'रसोई', schools: 'विद्यालय', nutrition: 'मेनू और पोषण', quality: 'निरीक्षण', recalls: 'वापसी', reports: 'रिपोर्ट',
      locations: 'स्थान', commodities: 'खाद्य सामग्री', vehicles: 'वाहन', facilities: 'सुविधाएँ', suppliers: 'आपूर्तिकर्ता', users: 'उपयोगकर्ता', config: 'कार्यक्रम सेटिंग', audit: 'ऑडिट ट्रेल', console: 'एडमिन कंसोल' },
    shell: { search: 'लॉट, शिपमेंट या विद्यालय खोजें', online: 'ऑनलाइन', offline: 'ऑफ़लाइन — प्रविष्टियाँ इस डिवाइस पर सहेजी जा रही हैं', pending: '{{count}} सिंक की प्रतीक्षा में', signOut: 'साइन आउट', account: 'मेरा खाता', theme: 'डार्क मोड', language: 'भाषा', notifications: 'सूचनाएँ', allCaughtUp: 'कोई नई सूचना नहीं', scope: 'देख रहे हैं', wholeState: 'पूरा राज्य' },
  } },
  kn: { translation: {
    nav: { group: { home: 'ನನ್ನ ಡೆಸ್ಕ್', lastMile: 'ಕೊನೆಯ ಮೈಲಿ', monitor: 'ಮೇಲ್ವಿಚಾರಣೆ', supply: 'ಪೂರೈಕೆ ಸರಪಳಿ', meals: 'ಊಟ', assure: 'ಗುಣಮಟ್ಟ', admin: 'ಆಡಳಿತ' },
      work: 'ನನ್ನ ಕೆಲಸ', indents: 'ಇಂಡೆಂಟ್‌ಗಳು', lastMile: 'ಕೊನೆಯ ಮೈಲಿ', overview: 'ಕಮಾಂಡ್ ಸೆಂಟರ್', trace: 'ಟ್ರ್ಯಾಕ್ ಮತ್ತು ಟ್ರೇಸ್', exceptions: 'ವಿನಾಯಿತಿಗಳು', procurement: 'ಖರೀದಿ', inventory: 'ದಾಸ್ತಾನು', logistics: 'ಸಾಗಣೆ',
      kitchen: 'ಅಡುಗೆಮನೆ', schools: 'ಶಾಲೆಗಳು', nutrition: 'ಮೆನು ಮತ್ತು ಪೋಷಣೆ', quality: 'ತಪಾಸಣೆ', recalls: 'ಹಿಂಪಡೆಯುವಿಕೆ', reports: 'ವರದಿಗಳು',
      locations: 'ಸ್ಥಳಗಳು', commodities: 'ಆಹಾರ ವಸ್ತುಗಳು', vehicles: 'ವಾಹನಗಳು', facilities: 'ಸೌಲಭ್ಯಗಳು', suppliers: 'ಪೂರೈಕೆದಾರರು', users: 'ಬಳಕೆದಾರರು', config: 'ಕಾರ್ಯಕ್ರಮ ಸೆಟ್ಟಿಂಗ್', audit: 'ಲೆಕ್ಕಪರಿಶೋಧನೆ', console: 'ಆಡಳಿತ ಕೇಂದ್ರ' },
    shell: { search: 'ಲಾಟ್, ಸಾಗಣೆ ಅಥವಾ ಶಾಲೆ ಹುಡುಕಿ', online: 'ಆನ್‌ಲೈನ್', offline: 'ಆಫ್‌ಲೈನ್ — ನಮೂದುಗಳು ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಯುತ್ತವೆ', pending: '{{count}} ಸಿಂಕ್‌ಗಾಗಿ ಕಾಯುತ್ತಿದೆ', signOut: 'ಸೈನ್ ಔಟ್', account: 'ನನ್ನ ಖಾತೆ', theme: 'ಡಾರ್ಕ್ ಮೋಡ್', language: 'ಭಾಷೆ', notifications: 'ಅಧಿಸೂಚನೆಗಳು', allCaughtUp: 'ಹೊಸ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ', scope: 'ವೀಕ್ಷಣೆ', wholeState: 'ಇಡೀ ರಾಜ್ಯ' },
  } },
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'ta', label: 'தமிழ்' }, { code: 'hi', label: 'हिन्दी' }, { code: 'kn', label: 'ಕನ್ನಡ' },
];

void i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false } });
export default i18n;
