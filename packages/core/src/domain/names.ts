import type { Outlet } from "./types";

// The datasets identify outlets only by id. Display names are fictional neighbourhoods in each
// outlet's district, assigned deterministically so every screen and role shows the same name.
const AREAS: Record<string, string[]> = {
  Colombo: ["Kollupitiya", "Bambalapitiya", "Wellawatte", "Dehiwala", "Nugegoda", "Maharagama", "Rajagiriya", "Borella", "Kotte", "Mount Lavinia", "Battaramulla", "Kirulapone", "Havelock Town", "Narahenpita", "Pettah", "Kotahena", "Moratuwa", "Ratmalana", "Kohuwala", "Thimbirigasyaya", "Grandpass", "Wattala", "Kelaniya", "Kaduwela"],
  Gampaha: ["Kiribathgoda", "Ja-Ela", "Negombo", "Gampaha Town", "Kadawatha", "Ragama", "Minuwangoda", "Kandana", "Divulapitiya", "Veyangoda", "Nittambuwa", "Seeduwa", "Katunayake", "Mirigama", "Delgoda"],
  Kalutara: ["Panadura", "Kalutara Town", "Horana", "Beruwala", "Aluthgama", "Wadduwa", "Matugama", "Bandaragama", "Ingiriya"],
  Galle: ["Galle Fort", "Karapitiya", "Hikkaduwa", "Ambalangoda", "Baddegama", "Elpitiya", "Unawatuna", "Bentota"],
  Matara: ["Matara Town", "Weligama", "Akuressa", "Dikwella", "Hakmana", "Kamburupitiya"],
  Kurunegala: ["Kurunegala Town", "Kuliyapitiya", "Pannala", "Narammala", "Wariyapola", "Polgahawela", "Mawathagama", "Ibbagamuwa"],
  Puttalam: ["Chilaw", "Puttalam Town", "Wennappuwa", "Marawila", "Nattandiya"],
  Kandy: ["Kandy City", "Peradeniya", "Katugastota", "Kundasale", "Digana", "Gampola", "Pilimathalawa", "Kadugannawa", "Akurana", "Menikhinna", "Tennekumbura", "Ampitiya", "Gelioya", "Nawalapitiya", "Wattegama", "Pallekele"],
  Matale: ["Matale Town", "Dambulla", "Ukuwela", "Rattota", "Galewela", "Naula", "Palapathwela"],
  "Nuwara Eliya": ["Nuwara Eliya Town", "Hatton", "Talawakele", "Nanu Oya", "Ragala", "Maskeliya"],
  Badulla: ["Badulla Town", "Bandarawela", "Ella", "Welimada", "Haputale", "Mahiyanganaya"],
  Kegalle: ["Kegalle Town", "Mawanella", "Warakapola", "Rambukkana", "Yatiyantota", "Ruwanwella"],
};
const MALLS: Record<string, string[]> = {
  Colombo: ["One Galle Face", "Colombo City Centre", "Havelock City Mall", "Marino Mall", "Liberty Plaza", "Crescat Boulevard"],
  Kandy: ["Kandy City Centre", "Kandy Mall"],
  Gampaha: ["Negombo Mall"],
};

let cache: Map<string, string> | null = null;

export function outletNames(outlets: Outlet[]): Map<string, string> {
  if (cache) return cache;
  const used = new Map<string, number>();
  const mallUsed = new Map<string, number>();
  cache = new Map();
  for (const o of [...outlets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (o.parking === "mall_dock" && MALLS[o.district]?.length) {
      const i = mallUsed.get(o.district) ?? 0;
      mallUsed.set(o.district, i + 1);
      cache.set(o.id, MALLS[o.district][i % MALLS[o.district].length] + (i >= MALLS[o.district].length ? " II" : ""));
      continue;
    }
    const list = AREAS[o.district] ?? [o.district];
    const i = used.get(o.district) ?? 0;
    used.set(o.district, i + 1);
    cache.set(o.id, list[i % list.length] + (i >= list.length ? ` ${Math.floor(i / list.length) + 1}` : ""));
  }
  return cache;
}
