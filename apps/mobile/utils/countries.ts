/**
 * ISO 3166-1: alpha-3, alpha-2, and the English name, one country per line.
 *
 * Services hand out alpha-3 ("USA"); `Intl.DisplayNames` only accepts alpha-2
 * ("US") and is absent from Hermes, so the English name has to be shipped as
 * the answer of last resort. Kept as lines rather than an object literal
 * because that is what a table nobody reads should cost — 249 entries, one grep
 * away, no punctuation.
 */
const COUNTRIES_PACKED = `ABW AW Aruba
AFG AF Afghanistan
AGO AO Angola
AIA AI Anguilla
ALA AX Åland Islands
ALB AL Albania
AND AD Andorra
ARE AE United Arab Emirates
ARG AR Argentina
ARM AM Armenia
ASM AS American Samoa
ATA AQ Antarctica
ATF TF French Southern Territories
ATG AG Antigua and Barbuda
AUS AU Australia
AUT AT Austria
AZE AZ Azerbaijan
BDI BI Burundi
BEL BE Belgium
BEN BJ Benin
BES BQ Caribbean Netherlands
BFA BF Burkina Faso
BGD BD Bangladesh
BGR BG Bulgaria
BHR BH Bahrain
BHS BS Bahamas
BIH BA Bosnia and Herzegovina
BLM BL Saint Barthélemy
BLR BY Belarus
BLZ BZ Belize
BMU BM Bermuda
BOL BO Bolivia
BRA BR Brazil
BRB BB Barbados
BRN BN Brunei
BTN BT Bhutan
BVT BV Bouvet Island
BWA BW Botswana
CAF CF Central African Republic
CAN CA Canada
CCK CC Cocos Islands
CHE CH Switzerland
CHL CL Chile
CHN CN China
CIV CI Côte d'Ivoire
CMR CM Cameroon
COD CD DR Congo
COG CG Congo
COK CK Cook Islands
COL CO Colombia
COM KM Comoros
CPV CV Cabo Verde
CRI CR Costa Rica
CUB CU Cuba
CUW CW Curaçao
CXR CX Christmas Island
CYM KY Cayman Islands
CYP CY Cyprus
CZE CZ Czechia
DEU DE Germany
DJI DJ Djibouti
DMA DM Dominica
DNK DK Denmark
DOM DO Dominican Republic
DZA DZ Algeria
ECU EC Ecuador
EGY EG Egypt
ERI ER Eritrea
ESH EH Western Sahara
ESP ES Spain
EST EE Estonia
ETH ET Ethiopia
FIN FI Finland
FJI FJ Fiji
FLK FK Falkland Islands
FRA FR France
FRO FO Faroe Islands
FSM FM Micronesia
GAB GA Gabon
GBR GB United Kingdom
GEO GE Georgia
GGY GG Guernsey
GHA GH Ghana
GIB GI Gibraltar
GIN GN Guinea
GLP GP Guadeloupe
GMB GM Gambia
GNB GW Guinea-Bissau
GNQ GQ Equatorial Guinea
GRC GR Greece
GRD GD Grenada
GRL GL Greenland
GTM GT Guatemala
GUF GF French Guiana
GUM GU Guam
GUY GY Guyana
HKG HK Hong Kong
HMD HM Heard Island and McDonald Islands
HND HN Honduras
HRV HR Croatia
HTI HT Haiti
HUN HU Hungary
IDN ID Indonesia
IMN IM Isle of Man
IND IN India
IOT IO British Indian Ocean Territory
IRL IE Ireland
IRN IR Iran
IRQ IQ Iraq
ISL IS Iceland
ISR IL Israel
ITA IT Italy
JAM JM Jamaica
JEY JE Jersey
JOR JO Jordan
JPN JP Japan
KAZ KZ Kazakhstan
KEN KE Kenya
KGZ KG Kyrgyzstan
KHM KH Cambodia
KIR KI Kiribati
KNA KN Saint Kitts and Nevis
KOR KR South Korea
KWT KW Kuwait
LAO LA Laos
LBN LB Lebanon
LBR LR Liberia
LBY LY Libya
LCA LC Saint Lucia
LIE LI Liechtenstein
LKA LK Sri Lanka
LSO LS Lesotho
LTU LT Lithuania
LUX LU Luxembourg
LVA LV Latvia
MAC MO Macao
MAF MF Saint Martin
MAR MA Morocco
MCO MC Monaco
MDA MD Moldova
MDG MG Madagascar
MDV MV Maldives
MEX MX Mexico
MHL MH Marshall Islands
MKD MK North Macedonia
MLI ML Mali
MLT MT Malta
MMR MM Myanmar
MNE ME Montenegro
MNG MN Mongolia
MNP MP Northern Mariana Islands
MOZ MZ Mozambique
MRT MR Mauritania
MSR MS Montserrat
MTQ MQ Martinique
MUS MU Mauritius
MWI MW Malawi
MYS MY Malaysia
MYT YT Mayotte
NAM NA Namibia
NCL NC New Caledonia
NER NE Niger
NFK NF Norfolk Island
NGA NG Nigeria
NIC NI Nicaragua
NIU NU Niue
NLD NL Netherlands
NOR NO Norway
NPL NP Nepal
NRU NR Nauru
NZL NZ New Zealand
OMN OM Oman
PAK PK Pakistan
PAN PA Panama
PCN PN Pitcairn
PER PE Peru
PHL PH Philippines
PLW PW Palau
PNG PG Papua New Guinea
POL PL Poland
PRI PR Puerto Rico
PRK KP North Korea
PRT PT Portugal
PRY PY Paraguay
PSE PS Palestine
PYF PF French Polynesia
QAT QA Qatar
REU RE Réunion
ROU RO Romania
RUS RU Russia
RWA RW Rwanda
SAU SA Saudi Arabia
SDN SD Sudan
SEN SN Senegal
SGP SG Singapore
SGS GS South Georgia
SHN SH Saint Helena
SJM SJ Svalbard and Jan Mayen
SLB SB Solomon Islands
SLE SL Sierra Leone
SLV SV El Salvador
SMR SM San Marino
SOM SO Somalia
SPM PM Saint Pierre and Miquelon
SRB RS Serbia
SSD SS South Sudan
STP ST Sao Tome and Principe
SUR SR Suriname
SVK SK Slovakia
SVN SI Slovenia
SWE SE Sweden
SWZ SZ Eswatini
SXM SX Sint Maarten
SYC SC Seychelles
SYR SY Syria
TCA TC Turks and Caicos Islands
TCD TD Chad
TGO TG Togo
THA TH Thailand
TJK TJ Tajikistan
TKL TK Tokelau
TKM TM Turkmenistan
TLS TL Timor-Leste
TON TO Tonga
TTO TT Trinidad and Tobago
TUN TN Tunisia
TUR TR Türkiye
TUV TV Tuvalu
TWN TW Taiwan
TZA TZ Tanzania
UGA UG Uganda
UKR UA Ukraine
UMI UM U.S. Outlying Islands
URY UY Uruguay
USA US United States
UZB UZ Uzbekistan
VAT VA Vatican City
VCT VC Saint Vincent and the Grenadines
VEN VE Venezuela
VGB VG British Virgin Islands
VIR VI U.S. Virgin Islands
VNM VN Vietnam
VUT VU Vanuatu
WLF WF Wallis and Futuna
WSM WS Samoa
YEM YE Yemen
ZAF ZA South Africa
ZMB ZM Zambia
ZWE ZW Zimbabwe`;

type Country = { alpha2: string; name: string };

let countriesByAlpha3: Map<string, Country> | undefined;

function lookup(alpha3: string): Country | undefined {
  if (!countriesByAlpha3) {
    countriesByAlpha3 = new Map();
    for (const line of COUNTRIES_PACKED.split("\n")) {
      countriesByAlpha3.set(line.slice(0, 3), {
        alpha2: line.slice(4, 6),
        name: line.slice(7),
      });
    }
  }
  return countriesByAlpha3.get(alpha3.toUpperCase());
}

/**
 * A country code as a name, translated where the platform can do it.
 *
 * `Intl.DisplayNames` is the platform's own translated list and is used when
 * there is one — but Hermes implements no such thing, and a build without full
 * ICU throws, so the shipped English name is the fallback rather than the bare
 * code. A stub that answers with the code it was given counts as no answer.
 *
 * The locale is passed in rather than read from i18n so that callers re-render
 * on a language change — and so this stays a pure function of its arguments.
 */
export function countryName(code: string, locale?: string): string {
  const country = lookup(code);
  if (!country) return code;
  try {
    const displayed = new Intl.DisplayNames(locale ? [locale] : undefined, {
      type: "region",
    }).of(country.alpha2);
    if (displayed && displayed !== country.alpha2) return displayed;
  } catch {
    // No Intl.DisplayNames here; the shipped name below is the answer.
  }
  return country.name;
}
