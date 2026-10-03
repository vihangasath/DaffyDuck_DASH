import type { Depot, Outlet } from "./types";

export type LatLng = [lat: number, lng: number];

// The shared datasets carry no outlet coordinates. Outlets are named after a real neighbourhood
// in their district (see names.ts), so the map places each pin at that neighbourhood's approximate
// centre. The database seeds Outlet.lat / Outlet.lng from this, and stored coordinates always win.
const PLACES: Record<string, LatLng> = {
  // Colombo
  Kollupitiya: [6.9147, 79.8497], Bambalapitiya: [6.8918, 79.856], Wellawatte: [6.8747, 79.8605], Dehiwala: [6.8511, 79.8659],
  Nugegoda: [6.8649, 79.8997], Maharagama: [6.848, 79.9265], Rajagiriya: [6.9094, 79.894], Borella: [6.9147, 79.8778],
  Kotte: [6.888, 79.912], "Mount Lavinia": [6.839, 79.8653], Battaramulla: [6.8994, 79.9186], Kirulapone: [6.879, 79.877],
  "Havelock Town": [6.883, 79.865], Narahenpita: [6.899, 79.877], Pettah: [6.9366, 79.85], Kotahena: [6.948, 79.86],
  Moratuwa: [6.773, 79.8816], Ratmalana: [6.82, 79.88], Kohuwala: [6.866, 79.887], Thimbirigasyaya: [6.895, 79.868],
  Grandpass: [6.948, 79.875], Wattala: [6.989, 79.892], Kelaniya: [6.9553, 79.922], Kaduwela: [6.936, 79.984],
  // Gampaha
  Kiribathgoda: [6.978, 79.929], "Ja-Ela": [7.0744, 79.8919], Negombo: [7.2083, 79.8358], "Gampaha Town": [7.0917, 79.999],
  Kadawatha: [7.001, 79.953], Ragama: [7.028, 79.918], Minuwangoda: [7.168, 79.953], Kandana: [7.048, 79.897],
  Divulapitiya: [7.224, 80.015], Veyangoda: [7.1553, 80.0582], Nittambuwa: [7.1446, 80.0948], Seeduwa: [7.125, 79.883],
  Katunayake: [7.17, 79.884], Mirigama: [7.241, 80.127], Delgoda: [6.99, 80.013],
  // Kalutara
  Panadura: [6.7132, 79.9026], "Kalutara Town": [6.5854, 79.9607], Horana: [6.7159, 80.0626], Beruwala: [6.4788, 79.9828],
  Aluthgama: [6.434, 80.003], Wadduwa: [6.667, 79.928], Matugama: [6.522, 80.114], Bandaragama: [6.714, 79.988], Ingiriya: [6.744, 80.154],
  // Galle
  "Galle Fort": [6.026, 80.217], Karapitiya: [6.064, 80.227], Hikkaduwa: [6.1395, 80.1063], Ambalangoda: [6.235, 80.054],
  Baddegama: [6.165, 80.178], Elpitiya: [6.291, 80.159], Unawatuna: [6.01, 80.249], Bentota: [6.421, 80.0],
  // Matara
  "Matara Town": [5.9485, 80.5353], Weligama: [5.975, 80.429], Akuressa: [6.1, 80.48], Dikwella: [5.967, 80.697],
  Hakmana: [6.08, 80.64], Kamburupitiya: [6.077, 80.564],
  // Kurunegala
  "Kurunegala Town": [7.4863, 80.3647], Kuliyapitiya: [7.469, 80.04], Pannala: [7.329, 80.024], Narammala: [7.433, 80.217],
  Wariyapola: [7.624, 80.238], Polgahawela: [7.333, 80.3], Mawathagama: [7.44, 80.44], Ibbagamuwa: [7.543, 80.448],
  // Puttalam
  Chilaw: [7.5758, 79.7953], "Puttalam Town": [8.0362, 79.8283], Wennappuwa: [7.349, 79.841], Marawila: [7.409, 79.833], Nattandiya: [7.408, 79.868],
  // Kandy
  "Kandy City": [7.2906, 80.6337], Peradeniya: [7.269, 80.597], Katugastota: [7.317, 80.625], Kundasale: [7.28, 80.683],
  Digana: [7.297, 80.737], Gampola: [7.164, 80.577], Pilimathalawa: [7.266, 80.544], Kadugannawa: [7.254, 80.524],
  Akurana: [7.364, 80.618], Menikhinna: [7.317, 80.707], Tennekumbura: [7.283, 80.662], Ampitiya: [7.276, 80.65],
  Gelioya: [7.213, 80.601], Nawalapitiya: [7.054, 80.534], Wattegama: [7.35, 80.681], Pallekele: [7.284, 80.72],
  // Matale
  "Matale Town": [7.4675, 80.6234], Dambulla: [7.86, 80.6517], Ukuwela: [7.424, 80.629], Rattota: [7.52, 80.678],
  Galewela: [7.758, 80.57], Naula: [7.708, 80.652], Palapathwela: [7.533, 80.623],
  // Nuwara Eliya
  "Nuwara Eliya Town": [6.9497, 80.7891], Hatton: [6.8916, 80.5955], Talawakele: [6.937, 80.659], "Nanu Oya": [6.943, 80.744],
  Ragala: [7.028, 80.79], Maskeliya: [6.833, 80.567],
  // Badulla
  "Badulla Town": [6.9934, 81.055], Bandarawela: [6.829, 80.987], Ella: [6.8667, 81.0466], Welimada: [6.903, 80.913],
  Haputale: [6.768, 80.958], Mahiyanganaya: [7.32, 81.0],
  // Kegalle
  "Kegalle Town": [7.2513, 80.3464], Mawanella: [7.253, 80.446], Warakapola: [7.227, 80.197], Rambukkana: [7.324, 80.391],
  Yatiyantota: [7.024, 80.3], Ruwanwella: [7.044, 80.256],
  // Malls
  "One Galle Face": [6.927, 79.845], "Colombo City Centre": [6.917, 79.856], "Havelock City Mall": [6.886, 79.868],
  "Marino Mall": [6.899, 79.854], "Liberty Plaza": [6.911, 79.852], "Crescat Boulevard": [6.918, 79.848],
  "Kandy City Centre": [7.293, 80.637], "Kandy Mall": [7.288, 80.629], "Negombo Mall": [7.209, 79.844],
};

const DISTRICT: Record<string, LatLng> = {
  Colombo: [6.9, 79.87], Gampaha: [7.09, 80.0], Kalutara: [6.58, 79.98], Galle: [6.05, 80.22], Matara: [5.95, 80.54],
  Kurunegala: [7.49, 80.36], Puttalam: [8.03, 79.83], Kandy: [7.29, 80.63], Matale: [7.47, 80.62], "Nuwara Eliya": [6.97, 80.78],
  Badulla: [6.99, 81.06], Kegalle: [7.25, 80.35],
};

export const DEPOT_LATLNG: Record<Depot, LatLng> = { Peliyagoda: [6.965, 79.883], Kandy: [7.275, 80.615] };

/** Small deterministic offset (≈ 150–650 m) so outlets sharing a neighbourhood don't stack. */
function jitter(id: string, [lat, lng]: LatLng): LatLng {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const r = 0.0015 + ((h >> 9) % 45) / 10000;
  return [lat + r * Math.sin(angle), lng + r * Math.cos(angle)];
}

/** Approximate position of an outlet from its display name (e.g. "Borella 2" → Borella, offset). */
export function outletLatLng(outlet: Outlet, displayName: string): LatLng {
  if (outlet.lat != null && outlet.lng != null) return [outlet.lat, outlet.lng];
  const base = displayName.replace(/ (II|\d+)$/, "");
  const exact = PLACES[displayName] ?? PLACES[base];
  if (exact && base === displayName) return exact;
  return jitter(outlet.id, exact ?? DISTRICT[outlet.district] ?? DEPOT_LATLNG[outlet.depot]);
}
