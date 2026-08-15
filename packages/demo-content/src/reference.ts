import type { ReferenceItem } from './types.js';

/**
 * §9's reference tables, exported from a running instance.
 *
 * The app needs these before it can record anything — a breed is a code from
 * this table, not free text, and a discipline picker with no options is a
 * wizard step nobody can finish. They are bundled rather than fetched so the
 * demo works with no server at all, and so a first launch on a bad connection
 * does not open on an empty form.
 */
export const DEMO_BREEDS: ReferenceItem[] = [
  {
    "code": "anadolu_yerli",
    "name": "Anadolu Yerli Atı",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "uzunyayla",
    "name": "Uzunyayla",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "malakan",
    "name": "Malakan",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "cukurova",
    "name": "Çukurova",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "canik",
    "name": "Canik",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "trakya",
    "name": "Trakya",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "rahvan_at",
    "name": "Rahvan Atı",
    "origin": "TR",
    "groupCode": "native_tr"
  },
  {
    "code": "turkoman",
    "name": "Türkmen Atı",
    "origin": "TM",
    "groupCode": "asian"
  },
  {
    "code": "arabian",
    "name": "Arap Atı",
    "origin": "SA",
    "groupCode": "arabian"
  },
  {
    "code": "anglo_arabian",
    "name": "İngiliz-Arap",
    "origin": "FR",
    "groupCode": "arabian"
  },
  {
    "code": "shagya_arabian",
    "name": "Shagya Arap",
    "origin": "HU",
    "groupCode": "arabian"
  },
  {
    "code": "partbred_arabian",
    "name": "Melez Arap",
    "origin": "XX",
    "groupCode": "arabian"
  },
  {
    "code": "arabian_egyptian",
    "name": "Mısır Arap Atı",
    "origin": "EG",
    "groupCode": "arabian"
  },
  {
    "code": "thoroughbred",
    "name": "İngiliz Atı (Safkan)",
    "origin": "GB",
    "groupCode": "thoroughbred"
  },
  {
    "code": "akhal_teke",
    "name": "Ahal Teke",
    "origin": "TM",
    "groupCode": "asian"
  },
  {
    "code": "standardbred",
    "name": "Standardbred",
    "origin": "US",
    "groupCode": "other"
  },
  {
    "code": "selle_francais",
    "name": "Selle Français",
    "origin": "FR",
    "groupCode": "warmblood"
  },
  {
    "code": "andalusian",
    "name": "Endülüs (PRE)",
    "origin": "ES",
    "groupCode": "iberian"
  },
  {
    "code": "lusitano",
    "name": "Lusitano",
    "origin": "PT",
    "groupCode": "iberian"
  },
  {
    "code": "alter_real",
    "name": "Alter Real",
    "origin": "PT",
    "groupCode": "iberian"
  },
  {
    "code": "menorquin",
    "name": "Menorka Atı",
    "origin": "ES",
    "groupCode": "iberian"
  },
  {
    "code": "lipizzaner",
    "name": "Lipizzaner",
    "origin": "SI",
    "groupCode": "baroque"
  },
  {
    "code": "friesian",
    "name": "Frizyen",
    "origin": "NL",
    "groupCode": "baroque"
  },
  {
    "code": "kladruber",
    "name": "Kladruber",
    "origin": "CZ",
    "groupCode": "baroque"
  },
  {
    "code": "knabstrupper",
    "name": "Knabstrupper",
    "origin": "DK",
    "groupCode": "baroque"
  },
  {
    "code": "frederiksborg",
    "name": "Frederiksborg",
    "origin": "DK",
    "groupCode": "baroque"
  },
  {
    "code": "hanoverian",
    "name": "Hanover",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "holsteiner",
    "name": "Holstein",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "oldenburg",
    "name": "Oldenburg",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "westphalian",
    "name": "Westfalya",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "trakehner",
    "name": "Trakehner",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "kwpn",
    "name": "KWPN (Hollanda)",
    "origin": "NL",
    "groupCode": "warmblood"
  },
  {
    "code": "belgian_warmblood",
    "name": "Belçika Sıcakkanlısı",
    "origin": "BE",
    "groupCode": "warmblood"
  },
  {
    "code": "bwp",
    "name": "BWP",
    "origin": "BE",
    "groupCode": "warmblood"
  },
  {
    "code": "zangersheide",
    "name": "Zangersheide",
    "origin": "BE",
    "groupCode": "warmblood"
  },
  {
    "code": "irish_sport_horse",
    "name": "İrlanda Spor Atı",
    "origin": "IE",
    "groupCode": "warmblood"
  },
  {
    "code": "danish_warmblood",
    "name": "Danimarka Sıcakkanlısı",
    "origin": "DK",
    "groupCode": "warmblood"
  },
  {
    "code": "swedish_warmblood",
    "name": "İsveç Sıcakkanlısı",
    "origin": "SE",
    "groupCode": "warmblood"
  },
  {
    "code": "bavarian",
    "name": "Bavyera",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "rheinlander",
    "name": "Rheinländer",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "mecklenburger",
    "name": "Mecklenburg",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "brandenburger",
    "name": "Brandenburg",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "sachsen_anhalt",
    "name": "Saksonya-Anhalt",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "hessian",
    "name": "Hessen",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "wurttemberger",
    "name": "Württemberg",
    "origin": "DE",
    "groupCode": "warmblood"
  },
  {
    "code": "polish_warmblood",
    "name": "Polonya Sıcakkanlısı",
    "origin": "PL",
    "groupCode": "warmblood"
  },
  {
    "code": "malopolski",
    "name": "Malopolski",
    "origin": "PL",
    "groupCode": "warmblood"
  },
  {
    "code": "wielkopolski",
    "name": "Wielkopolski",
    "origin": "PL",
    "groupCode": "warmblood"
  },
  {
    "code": "hungarian_sport",
    "name": "Macar Spor Atı",
    "origin": "HU",
    "groupCode": "warmblood"
  },
  {
    "code": "czech_warmblood",
    "name": "Çek Sıcakkanlısı",
    "origin": "CZ",
    "groupCode": "warmblood"
  },
  {
    "code": "sella_italiano",
    "name": "İtalyan Eyer Atı",
    "origin": "IT",
    "groupCode": "warmblood"
  },
  {
    "code": "finnhorse",
    "name": "Fin Atı",
    "origin": "FI",
    "groupCode": "other"
  },
  {
    "code": "russian_don",
    "name": "Don Atı",
    "origin": "RU",
    "groupCode": "other"
  },
  {
    "code": "budyonny",
    "name": "Budyonny",
    "origin": "RU",
    "groupCode": "other"
  },
  {
    "code": "orlov_trotter",
    "name": "Orlov Tırısçısı",
    "origin": "RU",
    "groupCode": "other"
  },
  {
    "code": "kabardin",
    "name": "Kabardey",
    "origin": "RU",
    "groupCode": "asian"
  },
  {
    "code": "karabair",
    "name": "Karabair",
    "origin": "UZ",
    "groupCode": "asian"
  },
  {
    "code": "karabakh",
    "name": "Karabağ Atı",
    "origin": "AZ",
    "groupCode": "asian"
  },
  {
    "code": "marwari",
    "name": "Marwari",
    "origin": "IN",
    "groupCode": "asian"
  },
  {
    "code": "kathiawari",
    "name": "Kathiawari",
    "origin": "IN",
    "groupCode": "asian"
  },
  {
    "code": "barb",
    "name": "Berberi Atı",
    "origin": "MA",
    "groupCode": "other"
  },
  {
    "code": "arabian_barb",
    "name": "Arap-Berberi",
    "origin": "MA",
    "groupCode": "other"
  },
  {
    "code": "quarter_horse",
    "name": "Quarter Horse",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "paint",
    "name": "Paint Horse",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "appaloosa",
    "name": "Appaloosa",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "mustang",
    "name": "Mustang",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "morgan",
    "name": "Morgan",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "pony_of_americas",
    "name": "Amerika Midillisi",
    "origin": "US",
    "groupCode": "pony"
  },
  {
    "code": "appendix",
    "name": "Appendix",
    "origin": "US",
    "groupCode": "stock"
  },
  {
    "code": "criollo",
    "name": "Criollo",
    "origin": "AR",
    "groupCode": "stock"
  },
  {
    "code": "mangalarga",
    "name": "Mangalarga Marchador",
    "origin": "BR",
    "groupCode": "gaited"
  },
  {
    "code": "peruvian_paso",
    "name": "Peru Paso",
    "origin": "PE",
    "groupCode": "gaited"
  },
  {
    "code": "paso_fino",
    "name": "Paso Fino",
    "origin": "PR",
    "groupCode": "gaited"
  },
  {
    "code": "azteca",
    "name": "Azteca",
    "origin": "MX",
    "groupCode": "stock"
  },
  {
    "code": "tennessee_walker",
    "name": "Tennessee Walker",
    "origin": "US",
    "groupCode": "gaited"
  },
  {
    "code": "missouri_fox_trotter",
    "name": "Missouri Fox Trotter",
    "origin": "US",
    "groupCode": "gaited"
  },
  {
    "code": "rocky_mountain",
    "name": "Rocky Mountain",
    "origin": "US",
    "groupCode": "gaited"
  },
  {
    "code": "american_saddlebred",
    "name": "American Saddlebred",
    "origin": "US",
    "groupCode": "gaited"
  },
  {
    "code": "icelandic",
    "name": "İzlanda Atı",
    "origin": "IS",
    "groupCode": "gaited"
  },
  {
    "code": "kentucky_mountain",
    "name": "Kentucky Mountain",
    "origin": "US",
    "groupCode": "gaited"
  },
  {
    "code": "campolina",
    "name": "Campolina",
    "origin": "BR",
    "groupCode": "gaited"
  },
  {
    "code": "percheron",
    "name": "Percheron",
    "origin": "FR",
    "groupCode": "draft"
  },
  {
    "code": "clydesdale",
    "name": "Clydesdale",
    "origin": "GB",
    "groupCode": "draft"
  },
  {
    "code": "shire",
    "name": "Shire",
    "origin": "GB",
    "groupCode": "draft"
  },
  {
    "code": "belgian_draft",
    "name": "Belçika Ağır Atı",
    "origin": "BE",
    "groupCode": "draft"
  },
  {
    "code": "ardennes",
    "name": "Ardennes",
    "origin": "BE",
    "groupCode": "draft"
  },
  {
    "code": "suffolk_punch",
    "name": "Suffolk Punch",
    "origin": "GB",
    "groupCode": "draft"
  },
  {
    "code": "noriker",
    "name": "Noriker",
    "origin": "AT",
    "groupCode": "draft"
  },
  {
    "code": "haflinger",
    "name": "Haflinger",
    "origin": "IT",
    "groupCode": "draft"
  },
  {
    "code": "black_forest",
    "name": "Kara Orman Atı",
    "origin": "DE",
    "groupCode": "draft"
  },
  {
    "code": "jutland",
    "name": "Jutland",
    "origin": "DK",
    "groupCode": "draft"
  },
  {
    "code": "boulonnais",
    "name": "Boulonnais",
    "origin": "FR",
    "groupCode": "draft"
  },
  {
    "code": "breton",
    "name": "Breton",
    "origin": "FR",
    "groupCode": "draft"
  },
  {
    "code": "comtois",
    "name": "Comtois",
    "origin": "FR",
    "groupCode": "draft"
  },
  {
    "code": "italian_heavy",
    "name": "İtalyan Ağır Atı",
    "origin": "IT",
    "groupCode": "draft"
  },
  {
    "code": "vladimir_draft",
    "name": "Vladimir Ağır Atı",
    "origin": "RU",
    "groupCode": "draft"
  },
  {
    "code": "welsh_a",
    "name": "Welsh A",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "welsh_b",
    "name": "Welsh B",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "welsh_c",
    "name": "Welsh C",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "welsh_d",
    "name": "Welsh D (Cob)",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "connemara",
    "name": "Connemara",
    "origin": "IE",
    "groupCode": "pony"
  },
  {
    "code": "new_forest",
    "name": "New Forest",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "shetland",
    "name": "Shetland Midillisi",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "dartmoor",
    "name": "Dartmoor",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "exmoor",
    "name": "Exmoor",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "dales",
    "name": "Dales",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "fell",
    "name": "Fell",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "highland",
    "name": "Highland",
    "origin": "GB",
    "groupCode": "pony"
  },
  {
    "code": "fjord",
    "name": "Fiyort Atı",
    "origin": "NO",
    "groupCode": "pony"
  },
  {
    "code": "gotland",
    "name": "Gotland",
    "origin": "SE",
    "groupCode": "pony"
  },
  {
    "code": "hucul",
    "name": "Hucul",
    "origin": "PL",
    "groupCode": "pony"
  },
  {
    "code": "german_riding_pony",
    "name": "Alman Binicilik Midillisi",
    "origin": "DE",
    "groupCode": "pony"
  },
  {
    "code": "pottok",
    "name": "Pottok",
    "origin": "ES",
    "groupCode": "pony"
  },
  {
    "code": "camargue",
    "name": "Camargue",
    "origin": "FR",
    "groupCode": "other"
  },
  {
    "code": "falabella",
    "name": "Falabella",
    "origin": "AR",
    "groupCode": "pony"
  },
  {
    "code": "mini_horse",
    "name": "Mini At",
    "origin": "US",
    "groupCode": "pony"
  },
  {
    "code": "caspian",
    "name": "Hazar Atı",
    "origin": "IR",
    "groupCode": "pony"
  },
  {
    "code": "gypsy_vanner",
    "name": "Gypsy Vanner",
    "origin": "GB",
    "groupCode": "draft"
  },
  {
    "code": "irish_cob",
    "name": "İrlanda Cob",
    "origin": "IE",
    "groupCode": "draft"
  },
  {
    "code": "pinto",
    "name": "Pinto",
    "origin": "US",
    "groupCode": "other"
  },
  {
    "code": "palomino",
    "name": "Palomino",
    "origin": "US",
    "groupCode": "other"
  },
  {
    "code": "buckskin",
    "name": "Buckskin",
    "origin": "US",
    "groupCode": "other"
  },
  {
    "code": "cob",
    "name": "Cob",
    "origin": "GB",
    "groupCode": "other"
  },
  {
    "code": "hackney",
    "name": "Hackney",
    "origin": "GB",
    "groupCode": "other"
  },
  {
    "code": "cleveland_bay",
    "name": "Cleveland Bay",
    "origin": "GB",
    "groupCode": "other"
  },
  {
    "code": "irish_draught",
    "name": "İrlanda Draught",
    "origin": "IE",
    "groupCode": "other"
  },
  {
    "code": "lusitano_cross",
    "name": "Lusitano Melezi",
    "origin": "PT",
    "groupCode": "iberian"
  },
  {
    "code": "sport_pony",
    "name": "Spor Midillisi",
    "origin": "XX",
    "groupCode": "pony"
  },
  {
    "code": "crossbred",
    "name": "Melez",
    "origin": null,
    "groupCode": "other"
  },
  {
    "code": "unknown",
    "name": "Bilinmiyor",
    "origin": null,
    "groupCode": "other"
  }
];

export const DEMO_DISCIPLINES: ReferenceItem[] = [
  {
    "code": "show_jumping",
    "name": "Engel Atlama"
  },
  {
    "code": "dressage",
    "name": "Dresaj"
  },
  {
    "code": "eventing",
    "name": "Üçlü Yarışma"
  },
  {
    "code": "endurance",
    "name": "Dayanıklılık"
  },
  {
    "code": "hunter",
    "name": "Hunter"
  },
  {
    "code": "equitation",
    "name": "Binicilik Tekniği"
  },
  {
    "code": "western_pleasure",
    "name": "Western Pleasure"
  },
  {
    "code": "reining",
    "name": "Reining"
  },
  {
    "code": "cutting",
    "name": "Cutting"
  },
  {
    "code": "barrel_racing",
    "name": "Varil Yarışı"
  },
  {
    "code": "roping",
    "name": "Kement"
  },
  {
    "code": "trail",
    "name": "Doğa Sürüşü"
  },
  {
    "code": "working_equitation",
    "name": "Working Equitation"
  },
  {
    "code": "horsemanship",
    "name": "At Yönetimi"
  },
  {
    "code": "natural_horsemanship",
    "name": "Doğal Binicilik"
  },
  {
    "code": "driving",
    "name": "Koşum"
  },
  {
    "code": "vaulting",
    "name": "Voltij"
  },
  {
    "code": "polo",
    "name": "Polo"
  },
  {
    "code": "racing_flat",
    "name": "Düz Koşu"
  },
  {
    "code": "racing_harness",
    "name": "Koşum Yarışı"
  },
  {
    "code": "rahvan",
    "name": "Rahvan Yarışı"
  },
  {
    "code": "cirit",
    "name": "Cirit"
  },
  {
    "code": "gaited",
    "name": "Yürüyüşlü"
  },
  {
    "code": "therapy_riding",
    "name": "Terapi Biniciliği"
  },
  {
    "code": "breeding",
    "name": "Damızlık"
  },
  {
    "code": "leisure",
    "name": "Hobi / Gezinti"
  }
];

export const DEMO_SERVICE_CATEGORIES: ReferenceItem[] = [
  {
    "code": "training",
    "name": "Eğitim"
  },
  {
    "code": "riding_lessons",
    "name": "Binicilik Dersi"
  },
  {
    "code": "boarding",
    "name": "Pansiyon"
  },
  {
    "code": "transport",
    "name": "Nakliye"
  },
  {
    "code": "veterinary",
    "name": "Veteriner"
  },
  {
    "code": "farrier",
    "name": "Nalbant"
  },
  {
    "code": "dentistry",
    "name": "Diş Bakımı"
  },
  {
    "code": "equine_therapy",
    "name": "At Terapisi"
  },
  {
    "code": "chiropractic",
    "name": "Kiropraktik"
  },
  {
    "code": "saddle_fitting",
    "name": "Eyer Uyumlama"
  },
  {
    "code": "tack_repair",
    "name": "Takım Tamiri"
  },
  {
    "code": "breeding_stud",
    "name": "Aygır Hizmeti"
  },
  {
    "code": "embryo_transfer",
    "name": "Embriyo Transferi"
  },
  {
    "code": "photography",
    "name": "Fotoğraf"
  },
  {
    "code": "videography",
    "name": "Video"
  },
  {
    "code": "clipping_grooming",
    "name": "Tıraş ve Bakım"
  },
  {
    "code": "feed_supply",
    "name": "Yem Tedariği"
  },
  {
    "code": "arena_construction",
    "name": "Manej Yapımı"
  },
  {
    "code": "insurance",
    "name": "Sigorta"
  },
  {
    "code": "agent_brokerage",
    "name": "Aracılık"
  },
  {
    "code": "ranch_services",
    "name": "Çiftlik Hizmetleri"
  },
  {
    "code": "event_organization",
    "name": "Etkinlik Organizasyonu"
  }
];
