const fs = require('fs');
let c = fs.readFileSync('components/SalonWebsiteView.tsx', 'utf8');

c = c.replace(/Kapak Fotoğrafı Yok/g, "{translations[language].salon.no_cover}");
c = c.replace(/Hemen Randevu Al/g, "{translations[language].salon.book_now}");
c = c.replace(/Ekibimiz ve Hizmetler/g, "{translations[language].salon.services}");
c = c.replace(/\{servicesList\.length\} Hizmet/g, "{translations[language].salon.services_count.replace('{count}', servicesList.length.toString())}");
c = c.replace(/Uzmanlarımız/g, "{translations[language].salon.our_team}");
c = c.replace(/Hemen Randevu Alın/g, "{translations[language].salon.book_now}");
c = c.replace(/Size en uygun hizmeti profesyonel ekibimizden alın\./g, "{translations[language].salon.book_now_desc}");
c = c.replace(/Randevu Başlat/g, "{translations[language].salon.start_booking}");
c = c.replace(/İletişim Bilgileri/g, "{translations[language].salon.contact_info}");
c = c.replace(/<p className="text-xs text-gray-500 mb-1">Telefon<\/p>/g, "<p className=\"text-xs text-gray-500 mb-1\">{translations[language].salon.phone}</p>");
c = c.replace(/<p className="text-xs text-gray-500 mb-1">Açık Adres<\/p>/g, "<p className=\"text-xs text-gray-500 mb-1\">{translations[language].salon.address}</p>");
c = c.replace(/Haritada Aç/g, "{translations[language].salon.open_in_maps}");

c = c.replace(/import \{ useLanguage \} from '\.\.\/contexts\/LanguageContext';/, "import { useLanguage } from '../contexts/LanguageContext';\nimport { translations } from '../utils/translations';");

fs.writeFileSync('components/SalonWebsiteView.tsx', c);
