// Orte erkennen (zuhause / arbeit / fremd) und Verkehrsmittel wählen.
'use strict';

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

const BUCHSTABE = 'a-z0-9äöüß';

// Wort als ganzes Wort im Text? ("arbeit" passt nicht auf "arbeitsamt")
function enthaeltWort(text, wort) {
  const w = norm(wort).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!w) return false;
  return new RegExp(`(^|[^${BUCHSTABE}])${w}($|[^${BUCHSTABE}])`).test(norm(text));
}

function passtAdresse(text, adresse) {
  const t = norm(text), a = norm(adresse);
  if (!a) return false;
  if (t.includes(a)) return true;
  const teil = norm(a.split(',')[0]); // Straße + Hausnummer
  return teil.length >= 5 && t.includes(teil);
}

// Ort-Text eines Termins -> 'zuhause' | 'arbeit' | 'fremd'. Leer = zuhause.
function ortArt(text, orte) {
  if (!norm(text)) return 'zuhause';
  for (const art of ['zuhause', 'arbeit']) {
    const o = (orte && orte[art]) || {};
    if (passtAdresse(text, o.adresse)) return art;
    if ((o.stichwoerter || []).some(w => enthaeltWort(text, w))) return art;
  }
  return 'fremd';
}

// Verkehrsmittel für eine Fahrt. direkt = ohne Umweg über zuhause.
function verkehrsmittel(vonArt, nachArt, direkt, v) {
  const paar = [vonArt, nachArt].sort().join('-');
  if (paar === 'arbeit-zuhause') return v.zuhauseArbeit;
  if (direkt && vonArt === 'arbeit') return v.direktVonArbeit;
  return v.sonst;
}

function streckenSchluessel(modus, von, nach) { return `${modus}|${norm(von)}|${norm(nach)}`; }

// Ergebnis der Adresssuche (Adresssuche in Scriptable) -> Adresstext für "Wegzeit abrufen".
// null, wenn nichts Brauchbares gefunden wurde.
function adresseAusOrt(o) {
  if (!o) return null;
  const strasse = [o.thoroughfare, o.subThoroughfare].filter(Boolean).join(' ');
  const ort = [o.postalCode, o.locality].filter(Boolean).join(' ');
  if (strasse && ort) return `${strasse}, ${ort}`;
  const teile = [o.name && !(ort || '').includes(o.name) ? o.name : null, ort || o.locality].filter(Boolean);
  if (teile.length) return [...new Set(teile)].join(', ');
  const loc = o.location;
  return loc && typeof loc.latitude === 'number' ? `${loc.latitude},${loc.longitude}` : null;
}

// Treffer der OpenStreetMap-Suche (Nominatim, format=jsonv2, addressdetails=1) in dieselbe Form
// wie Scriptables reverseGeocode bringen, damit adresseAusOrt für beide gilt.
function ausNominatim(x) {
  if (!x) return null;
  const a = x.address || {};
  const lat = Number(x.lat), lon = Number(x.lon);
  return {
    name: x.name || null,
    thoroughfare: a.road || a.pedestrian || a.footway || a.path || a.square || null,
    subThoroughfare: a.house_number || null,
    postalCode: a.postcode || null,
    locality: a.city || a.town || a.village || a.municipality || a.suburb || null,
    location: Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null,
  };
}

// Ort-Text -> Suchvarianten, von genau bis grob. Beispiel:
// "Nordort, XY (123456): Am Platz/Neuer Weg, 12345 Musterstadt (OT Nord)"
// -> [ganzer Text, "Am Platz/Neuer Weg, 12345 Musterstadt", "Am Platz, 12345 Musterstadt", "12345 Musterstadt"]
function suchVarianten(text) {
  const ganz = String(text || '').replace(/\s+/g, ' ').trim();
  if (!ganz) return [];
  const v = [ganz];
  let c = ganz.replace(/\([^)]*\)/g, ' ');
  if (c.includes(':')) c = c.slice(c.lastIndexOf(':') + 1);
  c = c.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
  if (c) v.push(c);
  const ohneSchraeg = c.replace(/\/[^,]*/g, '').replace(/\s+,/g, ',').trim();
  if (ohneSchraeg) v.push(ohneSchraeg);
  const plz = ganz.match(/\b(\d{5})\s+([^,()\n]+)/);
  if (plz) v.push(`${plz[1]} ${plz[2].trim()}`);
  return [...new Set(v)];
}

module.exports = { suchVarianten, adresseAusOrt, ausNominatim, norm, enthaeltWort, passtAdresse, ortArt, verkehrsmittel, streckenSchluessel };
