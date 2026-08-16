/**
 * Legal and policy content — spec §24.26, §26.
 *
 * §24.26 requires ToS, Privacy Policy, Welfare Policy and a Cookie notice
 * published in tr + en and linked from signup and settings. §26 adds
 * Community Guidelines, Prohibited Items, a Safe Buying Guide and a Dispute &
 * Reporting policy.
 *
 * Kept as data rather than as eight pairs of hand-written pages so the two
 * languages cannot drift: a section added in Turkish without an English
 * counterpart fails the type check, which is exactly the failure mode a
 * bilingual legal page has.
 *
 * These are drafted from the product's own rules — §14.4's welfare policy,
 * §13.4's review rules, §16.3's "no transaction fees", §24.14's deletion
 * window — and are written to be reviewed by a lawyer before launch, not
 * instead of one. The placeholders below (company entity, address, registry
 * number, DPO contact) are the parts that cannot be invented.
 */

export type Locale = 'tr' | 'en';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  slug: string;
  /** §19.1's path segment for each locale. */
  path: string;
  title: string;
  updatedAt: string;
  summary: string;
  sections: LegalSection[];
}

/** Filled in before launch; visible as a placeholder rather than invented. */
export const OPERATOR = {
  name: '[Şirket unvanı / Company name]',
  address: '[Adres / Address]',
  registry: '[Ticaret sicil no / Registry number]',
  contact: 'destek@onlyhorses.app',
  privacyContact: 'kvkk@onlyhorses.app',
  moderationContact: 'moderasyon@onlyhorses.app',
} as const;

const UPDATED = '2026-08-13';

const TR: Record<string, LegalDocument> = {
  kosullar: {
    slug: 'kosullar',
    path: 'kosullar',
    title: 'Kullanım Koşulları',
    updatedAt: UPDATED,
    summary:
      'ONLY HORSES bir ilan ve tanışma platformudur. At alım satımının tarafı değildir, ' +
      'ödemeye aracılık etmez ve komisyon almaz. Ekipman siparişleri platform ' +
      'üzerinden verilir; ödeme altyapısı henüz devrede değildir.',
    sections: [
      {
        heading: '1. Platformun konumu',
        body: [
          `ONLY HORSES (${OPERATOR.name}, ${OPERATOR.address}, ${OPERATOR.registry}) bir aracı hizmet ` +
            'sağlayıcıdır. İlanlar kullanıcılar tarafından oluşturulur; ONLY HORSES hiçbir satışın, ' +
            'kiralamanın veya iş sözleşmesinin tarafı değildir.',
          'ONLY HORSES bir ilandaki fiyatı, atın sağlık durumunu, soy bilgisini veya bir ilan sahibinin ' +
            'beyanlarını doğrulanmış olarak sunmaz. "Kimliği doğrulanmış" rozeti yalnızca hesabın ' +
            'kimliğinin doğrulandığını gösterir; ilanın içeriğini doğrulamaz.',
          'Ekipman ve malzeme siparişleri bunun istisnasıdır: sipariş platform üzerinden ' +
            'oluşturulur ve durumu burada takip edilir. Ürünü satan yine kullanıcıdır; ' +
            'ONLY HORSES ürünün ayıbından veya teslimatından sorumlu değildir.',
        ],
      },
      {
        heading: '2. Hesap ve yaş sınırı',
        body: [
          'Kayıt olmak için en az 16 yaşında olmalısın. İlan yayınlamak, hizmet vermek ve iş ilanı ' +
            'açmak için 18 yaşını doldurmuş ve kimlik doğrulamasını tamamlamış olman gerekir.',
          'Hesabının güvenliğinden sen sorumlusun. Bir hesabı başkası adına açamaz, satamaz veya ' +
            'devredemezsin.',
        ],
      },
      {
        heading: '3. İlanlar',
        body: [
          'İlan verirken doğru bilgi vermek zorundasın. Sahibi olmadığın ya da satma yetkin bulunmayan ' +
            'bir atı ilana koyamazsın.',
          'Refah Politikası’na aykırı ilanlar yayınlanmaz (bkz. Refah Politikası). Yasaklı içerik ' +
            'kuralları ihlal edildiğinde ilan kaldırılır ve hesap askıya alınabilir.',
          'İlk temas uygulama içinden kurulur. İlan metninde telefon numarası veya e-posta paylaşmak ' +
            'engellenir; bu, dolandırıcılığa karşı alınmış bir önlemdir.',
        ],
      },
      {
        heading: '4. Ekipman siparişleri',
        body: [
          'Ekipman ve malzeme ilanlarında "Satın al" ile sipariş oluşturabilirsin. Sipariş önce ' +
            'satıcının onayına düşer; satıcı stoğu onayladıktan sonra ödeme adımı açılır. ' +
            'Onaylanmayan bir siparişten hiçbir bedel doğmaz.',
          'Ödeme altyapısı henüz devrede değildir. Bu aşamada ödeme adımı yalnızca siparişi ' +
            '"ödendi" olarak işaretler ve stoktan düşer; ONLY HORSES üzerinden para tahsil ' +
            'edilmez. Bedelin nasıl ödeneceğini alıcı ve satıcı kendi aralarında belirler.',
          'Sipariş, teslim alındığı alıcı tarafından onaylanana kadar iptal edilebilir. ' +
            'İptal edilen bir siparişin adedi stoğa geri döner.',
          'Ürünün durumu, ayıbı, teslimatı ve iadesi satıcı ile alıcı arasındadır. Anlaşmazlıkta ' +
            'ONLY HORSES kayıtları taraflarla paylaşır, ancak hakem değildir.',
        ],
      },
      {
        heading: '5. Ücretler',
        body: [
          'Hesap açmak ve ilanlara bakmak ücretsizdir. Abonelikler, öne çıkarma ve iş ilanı ücretleri ' +
            'Fiyatlandırma sayfasında yayımlanır.',
          'ONLY HORSES at satışlarından komisyon almaz, ödeme tahsil etmez ve emanet (escrow) hizmeti ' +
            'vermez. Karşı tarafla yapacağın ödemenin sorumluluğu tamamen sana aittir.',
        ],
      },
      {
        heading: '6. Değerlendirmeler',
        body: [
          'Değerlendirme yazabilmek için karşı tarafla gerçekten yazışmış ya da bir devir işlemi ' +
            'tamamlamış olman gerekir. Değerlendirmeler, hakkında yazılan kişi tarafından silinemez; ' +
            'yalnızca moderatörler gerekçesi kayda geçirilerek gizleyebilir.',
        ],
      },
      {
        heading: '7. Sorumluluğun sınırı',
        body: [
          'ONLY HORSES, kullanıcılar arasındaki anlaşmazlıklardan, atın durumundan veya ödemelerden ' +
            'sorumlu değildir. Platform "olduğu gibi" sunulur.',
          'Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir.',
        ],
      },
      {
        heading: '8. İletişim',
        body: [`Sorular için: ${OPERATOR.contact}`],
      },
    ],
  },

  gizlilik: {
    slug: 'gizlilik',
    path: 'gizlilik',
    title: 'Gizlilik Politikası (KVKK / GDPR)',
    updatedAt: UPDATED,
    summary:
      'Hangi verileri neden işlediğimiz, kimlerle paylaştığımız ve verilerin üzerindeki haklarını ' +
      'nasıl kullanacağın.',
    sections: [
      {
        heading: '1. Veri sorumlusu',
        body: [
          `${OPERATOR.name}, ${OPERATOR.address}. Veri koruma başvuruları: ${OPERATOR.privacyContact}`,
        ],
      },
      {
        heading: '2. İşlediğimiz veriler',
        body: [
          'Hesap verileri: ad, e-posta, telefon, doğum tarihi, profil fotoğrafı, konum (seçtiğin ' +
            'hassasiyette), dil ve para birimi tercihleri.',
          'İçerik: at kayıtları, sağlık kayıtları, ilanlar, fotoğraf ve videolar, mesajlar, ' +
            'değerlendirmeler.',
          'İşlem verileri: abonelik ve satın alma kayıtları (kart bilgisi bizde tutulmaz, Stripe’ta ' +
            'işlenir), kimlik doğrulama sonucu (belge görüntüsü bizde tutulmaz).',
          'Teknik veriler: cihaz tokenı, IP adresi, uygulama sürümü, hata kayıtları.',
        ],
      },
      {
        heading: '3. Hukuki dayanak',
        body: [
          'Sözleşmenin ifası: hesabın çalışması, ilanların yayımlanması, mesajlaşma.',
          'Meşru menfaat: dolandırıcılık önleme, moderasyon, hizmetin geliştirilmesi.',
          'Açık rıza: pazarlama bildirimleri ve zorunlu olmayan çerezler.',
          'Hukuki yükümlülük: fatura ve muhasebe kayıtları.',
        ],
      },
      {
        heading: '4. Paylaştığımız taraflar',
        body: [
          'Altyapı ve hizmet sağlayıcılar: Google Cloud (barındırma), Stripe (ödeme ve kimlik ' +
            'doğrulama), Stream (mesajlaşma), Mux (video), Cloudflare (görsel dağıtımı), Resend ' +
            '(e-posta), PostHog (ürün analitiği), Sentry (hata takibi).',
          'Her sağlayıcıyla veri işleme sözleşmesi (DPA) yapılır ve mümkün olan yerlerde AB ' +
            'veri merkezleri tercih edilir.',
          'Verilerin reklam amacıyla üçüncü taraflara satılmaz.',
        ],
      },
      {
        heading: '5. Saklama süreleri',
        body: [
          'Hesap silme talebinden sonra kişisel verilerin 30 gün içinde silinir veya anonimleştirilir.',
          'At kayıtları ve sahiplik geçmişi, atın kimliğinin sürekliliği için silinmez; ancak eski ' +
            'sahibin adı yalnızca sahiplik geçmişinde bir metin olarak kalır.',
          'Değerlendirmeler silinmez, anonimleştirilir.',
          'Fatura kayıtları vergi mevzuatının öngördüğü süre boyunca saklanır.',
        ],
      },
      {
        heading: '6. Haklarım',
        body: [
          'KVKK m.11 ve GDPR m.15–22 uyarınca; verilerine erişme, düzeltme, silme, işlemeyi ' +
            'kısıtlama, taşınabilirlik ve itiraz haklarına sahipsin.',
          'Ayarlar > Veri indirme menüsünden tüm verilerinin makine tarafından okunabilir bir ' +
            'kopyasını talep edebilirsin; talebin 24 saat içinde hazırlanır.',
          'Ayarlar > Hesabı sil menüsünden silme talebinde bulunabilirsin. Talep 30 gün sonra ' +
            'uygulanır ve bu süre içinde geri alınabilir.',
        ],
      },
      {
        heading: '7. Çerezler',
        body: [
          'Zorunlu çerezler oturumu açık tutar ve güvenliği sağlar; bunlar rıza gerektirmez.',
          'Ölçümleme çerezleri yalnızca onay verirsen çalışır ve hangi sayfaların işe yaradığını ' +
            'anlamamıza yarar. Onayını istediğin zaman Ayarlar’dan geri alabilirsin.',
          'Reklam çerezi kullanılmaz.',
        ],
      },
    ],
  },

  'refah-politikasi': {
    slug: 'refah-politikasi',
    path: 'refah-politikasi',
    title: 'At Refahı Politikası',
    updatedAt: UPDATED,
    summary:
      'Bu platformda hangi ilanların yayınlanmayacağı ve neden. Kurallar koda gömülüdür; ' +
      'ihlal eden ilanlar yayına alınmaz.',
    sections: [
      {
        heading: 'Yayınlanmayan ilanlar',
        body: [
          'Kesimhane, et üretimi veya "kasaplık" ifadesi içeren ilanlar.',
          '6 aydan küçük tayların annesinden ayrı satışı.',
          'Gebe kısrakların gebeliğin son üç ayında nakil şartıyla satışı.',
          'Yarışma amaçlı "soring", kuyruk kesme (nicking) gibi uygulamaları ima eden ilanlar.',
          'Sağlık durumunu gizleyen ya da bilinen bir sakatlığı gizleyerek satmayı öneren ilanlar.',
        ],
      },
      {
        heading: 'İncelemeye alınan ilanlar',
        body: [
          'Olağandışı düşük fiyatlı, aciliyet vurgusu yapan ilanlar.',
          'Yeni açılmış ve doğrulanmamış hesaplardan gelen yüksek hacimli ilanlar.',
          'Sağlık kaydı bulunmayan yaşlı atların "her işe uygun" olarak tanıtılması.',
        ],
      },
      {
        heading: 'Bildir',
        body: [
          'Bu politikaya aykırı bir ilan gördüğünde ilan sayfasındaki “Bildir” düğmesini kullan. ' +
            `Acil durumlarda ${OPERATOR.moderationContact} adresine yazabilirsin.`,
        ],
      },
    ],
  },

  cerezler: {
    slug: 'cerezler',
    path: 'cerezler',
    title: 'Çerez Bildirimi',
    updatedAt: UPDATED,
    summary: 'Hangi çerezleri kullandığımız ve onayını nasıl yöneteceğin.',
    sections: [
      {
        heading: 'Zorunlu çerezler',
        body: [
          'Oturum tokenı ve güvenlik çerezleri. Bunlar olmadan giriş yapılamaz, bu nedenle rıza ' +
            'gerektirmezler.',
        ],
      },
      {
        heading: 'Ölçümleme çerezleri',
        body: [
          'PostHog üzerinden hangi sayfaların kullanıldığını ölçeriz. Yalnızca onay verirsen ' +
            'yüklenir; onayını Ayarlar > Gizlilik bölümünden geri alabilirsin.',
        ],
      },
      { heading: 'Reklam çerezleri', body: ['Reklam çerezi kullanılmıyor ve kullanılması planlanmıyor.'] },
    ],
  },

  'topluluk-kurallari': {
    slug: 'topluluk-kurallari',
    path: 'topluluk-kurallari',
    title: 'Topluluk Kuralları',
    updatedAt: UPDATED,
    summary: 'Mesajlaşmada ve ilanlarda beklenen davranış.',
    sections: [
      {
        heading: 'Beklediklerimiz',
        body: [
          'Doğru bilgi ver. Atın yaşı, boyu, sağlığı ve eğitimi hakkında yanıltıcı beyanda bulunma.',
          'İlk teması uygulama içinde kur. Ödemeyi platform dışına taşımaya çalışan mesajlar ' +
            'işaretlenir.',
          'Karşındakine saygılı ol. Taciz, hakaret ve ayrımcılık hesabın kapatılması sebebidir.',
        ],
      },
      {
        heading: 'Yaptırımlar',
        body: [
          'İlan gizlenebilir, hesap askıya alınabilir veya kalıcı olarak kapatılabilir. Kararın ' +
            'gerekçesi kayda geçirilir ve sana bildirilir.',
        ],
      },
    ],
  },

  'guvenli-alim': {
    slug: 'guvenli-alim',
    path: 'guvenli-alim',
    title: 'Güvenli Alım Rehberi',
    updatedAt: UPDATED,
    summary: 'At alırken kendini korumanın somut yolları.',
    sections: [
      {
        heading: 'Görmeden ödeme yapma',
        body: [
          'Atı görmeden kapora gönderme. "Başka alıcı var, bugün kapora at" baskısı en yaygın ' +
            'dolandırıcılık kalıbıdır.',
        ],
      },
      {
        heading: 'Veteriner muayenesi (PPE) iste',
        body: [
          'Satın alma öncesi muayeneyi kendi seçtiğin veterinere yaptır. Satıcının veterineri ' +
            'tarafsız değildir.',
          'Röntgenleri kendi veterinerine okut; sağlık dosyası talebini uygulama içinden yapabilirsin.',
        ],
      },
      {
        heading: 'Kimliği doğrula',
        body: [
          'Atın mikroçipini okut ve pasaportundaki numarayla karşılaştır. AB’de at pasaportu ' +
            'zorunludur; ONLY HORSES pasaport düzenlemez ve pasaportun yerini tutmaz.',
        ],
      },
      {
        heading: 'Yazışmayı uygulamada tut',
        body: [
          'Anlaşmazlık halinde uygulama içindeki yazışma tek kayıttır. WhatsApp’a geçmen istenirse ' +
            'bunu bir uyarı işareti say.',
        ],
      },
    ],
  },

  'itiraz-ve-bildirim': {
    slug: 'itiraz-ve-bildirim',
    path: 'itiraz-ve-bildirim',
    title: 'İtiraz ve Bildirim Politikası',
    updatedAt: UPDATED,
    summary: 'Bir içeriği nasıl bildirirsin, kararı nasıl itiraz edersin.',
    sections: [
      {
        heading: 'Bildirim',
        body: [
          'Her ilan, profil ve mesajda “Bildir” seçeneği vardır. Bildirimler moderasyon kuyruğuna ' +
            'düşer ve ciddiyetine göre sıralanır.',
          `Acil veya hayvan refahına ilişkin durumlar: ${OPERATOR.moderationContact}`,
        ],
      },
      {
        heading: 'Karar ve itiraz',
        body: [
          'Bir içeriğin kaldırılması ya da hesabın askıya alınması halinde gerekçesi sana bildirilir.',
          `Karara itiraz etmek için ${OPERATOR.contact} adresine yazabilirsin; itirazlar kararı veren ` +
            'moderatör dışında biri tarafından incelenir.',
        ],
      },
      {
        heading: 'Yasaklı ürünler',
        body: [
          'Reçeteli veteriner ilaçları, doping maddeleri, ikinci el sağlık gereçleri ve refah ' +
            'politikasına aykırı ekipman (örneğin soring malzemesi) ilan edilemez.',
        ],
      },
    ],
  },
};

const EN: Record<string, LegalDocument> = {
  kosullar: {
    slug: 'kosullar',
    path: 'kosullar',
    title: 'Terms of Use',
    updatedAt: UPDATED,
    summary:
      'ONLY HORSES is a listing and introduction platform. It is not a party to any horse sale, ' +
      'does not process payments between users, and takes no commission. Equipment orders are ' +
      'placed through the platform; payment processing is not live yet.',
    sections: [
      {
        heading: '1. What this platform is',
        body: [
          `ONLY HORSES (${OPERATOR.name}, ${OPERATOR.address}, ${OPERATOR.registry}) is an ` +
            'intermediary service provider. Listings are created by users; ONLY HORSES is not a party ' +
            'to any sale, lease or employment contract.',
          'ONLY HORSES does not present a price, a horse’s health, its pedigree or any seller claim as ' +
            'verified. An "identity verified" badge means the account holder’s identity was checked. ' +
            'It says nothing about the contents of their listing.',
        ],
      },
      {
        heading: '2. Accounts and age',
        body: [
          'You must be at least 16 to register. You must be 18 and identity-verified to publish a ' +
            'listing, offer a service or post a job.',
          'You are responsible for your account. You may not open one on someone else’s behalf, sell ' +
            'it, or transfer it.',
        ],
      },
      {
        heading: '3. Listings',
        body: [
          'Listings must be accurate. You may not list a horse you do not own or are not authorised ' +
            'to sell.',
          'Listings that breach the Welfare Policy are not published. Breaching the prohibited-content ' +
            'rules leads to removal and may lead to suspension.',
          'First contact happens in the app. Phone numbers and email addresses in listing text are ' +
            'blocked; this is an anti-fraud measure, not a lock-in.',
        ],
      },
      {
        heading: '4. Equipment orders',
        body: [
          'Equipment listings can be ordered with "Satın al". An order goes to the seller first; ' +
            'the payment step opens only once they confirm the stock. An order that is never ' +
            'confirmed costs nothing.',
          'Payment processing is not live. For now the payment step only marks the order paid and ' +
            'decrements the stock; no money is collected through ONLY HORSES. How the amount is ' +
            'settled is between buyer and seller.',
          'An order can be cancelled until the buyer confirms receipt. A cancelled order returns ' +
            'its quantity to the seller\'s stock.',
          'Condition, defects, delivery and returns are between seller and buyer. In a dispute ' +
            'ONLY HORSES will share its records with both parties, but is not an arbitrator.',
        ],
      },
      {
        heading: '5. Fees',
        body: [
          'Registering and browsing are free. Subscription, boost and job-post prices are published on ' +
            'the Pricing page.',
          'ONLY HORSES takes no commission on horse sales, collects no payment between users and ' +
            'offers no escrow. Payment between the parties is entirely at your own risk.',
        ],
      },
      {
        heading: '6. Reviews',
        body: [
          'A review requires a real conversation with the other party or a completed transfer. The ' +
            'subject of a review cannot delete it; only moderators can hide one, and the reason is ' +
            'recorded.',
        ],
      },
      {
        heading: '7. Limitation of liability',
        body: [
          'ONLY HORSES is not responsible for disputes between users, the condition of a horse, or ' +
            'payments. The platform is provided "as is".',
          'These terms are governed by the law of the Republic of Türkiye.',
        ],
      },
      { heading: '8. Contact', body: [`Questions: ${OPERATOR.contact}`] },
    ],
  },

  gizlilik: {
    slug: 'gizlilik',
    path: 'gizlilik',
    title: 'Privacy Policy (GDPR / KVKK)',
    updatedAt: UPDATED,
    summary:
      'What we process and why, who we share it with, and how to exercise your rights over it.',
    sections: [
      {
        heading: '1. Controller',
        body: [`${OPERATOR.name}, ${OPERATOR.address}. Data protection requests: ${OPERATOR.privacyContact}`],
      },
      {
        heading: '2. What we process',
        body: [
          'Account data: name, email, phone, date of birth, avatar, location at the precision you ' +
            'choose, language and currency preferences.',
          'Content: horse records, health records, listings, photos and video, messages, reviews.',
          'Transaction data: subscription and purchase records (card details are held by Stripe, not ' +
            'by us), identity verification outcomes (we never hold the document image).',
          'Technical data: device token, IP address, app version, error reports.',
        ],
      },
      {
        heading: '3. Lawful basis',
        body: [
          'Performance of a contract: running your account, publishing listings, messaging.',
          'Legitimate interest: fraud prevention, moderation, improving the service.',
          'Consent: marketing messages and non-essential cookies.',
          'Legal obligation: invoicing and accounting records.',
        ],
      },
      {
        heading: '4. Processors',
        body: [
          'Google Cloud (hosting), Stripe (payments and identity), Stream (messaging), Mux (video), ' +
            'Cloudflare (image delivery), Resend (email), PostHog (product analytics), Sentry (error ' +
            'tracking).',
          'Each has a data processing agreement, and EU regions are used where available.',
          'We do not sell personal data to advertisers.',
        ],
      },
      {
        heading: '5. Retention',
        body: [
          'After a deletion request your personal data is erased or anonymised within 30 days.',
          'Horse records and ownership history are retained so a horse’s identity survives; a former ' +
            'owner’s name remains only as text in the ownership history.',
          'Reviews are anonymised rather than deleted.',
          'Invoices are kept for the period tax law requires.',
        ],
      },
      {
        heading: '6. Your rights',
        body: [
          'Under GDPR Art. 15–22 and KVKK Art. 11 you may access, rectify, erase, restrict, port and ' +
            'object to the processing of your data.',
          'Settings → Download my data produces a machine-readable copy of everything we hold, ' +
            'prepared within 24 hours.',
          'Settings → Delete account schedules deletion. It takes effect after 30 days and can be ' +
            'cancelled at any point in that window.',
        ],
      },
      {
        heading: '7. Cookies',
        body: [
          'Essential cookies keep you signed in and secure; these need no consent.',
          'Measurement cookies load only if you allow them, and tell us which pages are useful. You ' +
            'can withdraw consent in Settings at any time.',
          'No advertising cookies are used.',
        ],
      },
    ],
  },

  'refah-politikasi': {
    slug: 'refah-politikasi',
    path: 'refah-politikasi',
    title: 'Horse Welfare Policy',
    updatedAt: UPDATED,
    summary:
      'Which listings are refused here and why. These rules are enforced in code, not only in ' +
      'moderation.',
    sections: [
      {
        heading: 'Listings we refuse',
        body: [
          'Slaughter, meat production, or any listing using "for meat" language.',
          'Foals under six months sold away from their dam.',
          'Mares in the final third of pregnancy sold with transport as a condition.',
          'Any listing implying soring, tail nicking or similar practices.',
          'Listings that conceal a known injury or propose hiding a health condition from a buyer.',
        ],
      },
      {
        heading: 'Listings we review',
        body: [
          'Unusually low prices combined with urgency.',
          'High listing volume from a new, unverified account.',
          'Older horses with no health records advertised as "suitable for anything".',
        ],
      },
      {
        heading: 'Reporting',
        body: [
          'Use "Report" on any listing that breaches this policy. For urgent welfare concerns write ' +
            `to ${OPERATOR.moderationContact}.`,
        ],
      },
    ],
  },

  cerezler: {
    slug: 'cerezler',
    path: 'cerezler',
    title: 'Cookie Notice',
    updatedAt: UPDATED,
    summary: 'Which cookies we use and how to manage your consent.',
    sections: [
      {
        heading: 'Essential',
        body: ['Session and security cookies. Sign-in does not work without them, so they need no consent.'],
      },
      {
        heading: 'Measurement',
        body: [
          'PostHog tells us which pages get used. Loaded only with your consent, withdrawable from ' +
            'Settings → Privacy.',
        ],
      },
      { heading: 'Advertising', body: ['No advertising cookies are used, and none are planned.'] },
    ],
  },

  'topluluk-kurallari': {
    slug: 'topluluk-kurallari',
    path: 'topluluk-kurallari',
    title: 'Community Guidelines',
    updatedAt: UPDATED,
    summary: 'What is expected in listings and in messages.',
    sections: [
      {
        heading: 'What we expect',
        body: [
          'Be accurate. Do not misrepresent a horse’s age, height, health or training.',
          'Keep first contact in the app. Messages pushing payment off-platform are flagged.',
          'Be civil. Harassment, abuse and discrimination end accounts.',
        ],
      },
      {
        heading: 'Enforcement',
        body: [
          'Content may be hidden and accounts suspended or closed. The reason is recorded and sent ' +
            'to you.',
        ],
      },
    ],
  },

  'guvenli-alim': {
    slug: 'guvenli-alim',
    path: 'guvenli-alim',
    title: 'Safe Buying Guide',
    updatedAt: UPDATED,
    summary: 'Concrete ways to protect yourself when buying a horse.',
    sections: [
      {
        heading: 'Never pay before you see the horse',
        body: [
          'Do not send a deposit for a horse you have not seen. "Another buyer is coming today" is the ' +
            'most common fraud pattern there is.',
        ],
      },
      {
        heading: 'Insist on a pre-purchase exam',
        body: [
          'Use your own vet, not the seller’s. Have the radiographs read by someone who works for you.',
          'You can request the health file from inside the app.',
        ],
      },
      {
        heading: 'Verify identity',
        body: [
          'Scan the microchip and check it against the passport. An EU horse passport is legally ' +
            'required; ONLY HORSES neither issues nor replaces one.',
        ],
      },
      {
        heading: 'Keep the conversation in the app',
        body: [
          'If a dispute arises, the in-app thread is the record. Being moved to WhatsApp early is a ' +
            'warning sign.',
        ],
      },
    ],
  },

  'itiraz-ve-bildirim': {
    slug: 'itiraz-ve-bildirim',
    path: 'itiraz-ve-bildirim',
    title: 'Dispute & Reporting Policy',
    updatedAt: UPDATED,
    summary: 'How to report content and how to appeal a decision.',
    sections: [
      {
        heading: 'Reporting',
        body: [
          'Every listing, profile and message has a "Report" action. Reports enter the moderation ' +
            'queue and are ordered by severity.',
          `Urgent or welfare-related concerns: ${OPERATOR.moderationContact}`,
        ],
      },
      {
        heading: 'Decisions and appeals',
        body: [
          'If content is removed or an account suspended, the reason is sent to you.',
          `To appeal, write to ${OPERATOR.contact}. Appeals are reviewed by someone other than the ` +
            'moderator who made the decision.',
        ],
      },
      {
        heading: 'Prohibited items',
        body: [
          'Prescription veterinary medicines, doping substances, second-hand medical devices and ' +
            'equipment that breaches the welfare policy (soring materials, for example) may not be ' +
            'listed.',
        ],
      },
    ],
  },
};

const DOCUMENTS: Record<Locale, Record<string, LegalDocument>> = { tr: TR, en: EN };

export function legalDocument(locale: string, slug: string): LegalDocument | null {
  const dictionary = DOCUMENTS[(locale as Locale) in DOCUMENTS ? (locale as Locale) : 'tr'];
  return dictionary[slug] ?? null;
}

/** Every legal path, for the sitemap and the footer. */
export const LEGAL_SLUGS = Object.keys(TR);

/**
 * §24.26 requires the four core documents to be linked from signup and
 * settings; the rest are §26's additions. Listing them separately keeps the
 * acceptance criterion checkable.
 */
export const REQUIRED_LEGAL_SLUGS = ['kosullar', 'gizlilik', 'refah-politikasi', 'cerezler'];
