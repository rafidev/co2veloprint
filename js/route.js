const TRANSITOUS_BASE = "https://api.transitous.org";

const ROUTE_COLOURS = [
  "#2ecc71", "#3498db", "#e67e22", "#9b59b6",
  "#1abc9c", "#e74c3c", "#f39c12", "#16a085",
];

const state = {
  routes: [],
  nextId: 0,
};

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

async function fetchTransitRoute(fromCoord, toCoord) {
  const params = new URLSearchParams({
    fromPlace: `${fromCoord[0]},${fromCoord[1]},0`,
    toPlace:   `${toCoord[0]},${toCoord[1]},0`,
    numItineraries: 1,
  });

  const res = await fetch(`${TRANSITOUS_BASE}/api/v5/plan?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transitous API error: ${res.status} — ${body}`);
  }
  const data = await res.json();
  const itineraries = data?.itineraries;
  if (!itineraries || itineraries.length === 0) {
    throw new Error("No transit route found between these locations.");
  }
  return itineraries[0];
}

function describeModes(itinerary) {
  const seen = new Set();
  for (const leg of itinerary.legs) {
    if (leg.mode !== "WALK") {
      seen.add(leg.routeShortName ? `${leg.mode} ${leg.routeShortName}` : leg.mode);
    }
  }
  return seen.size ? [...seen].join(" · ") : "Walk only";
}

function drawItinerary(itinerary, colour, leafletMap) {
  const layers = [];

  for (const leg of itinerary.legs) {
    const pts = leg.legGeometry?.points;
    if (!pts) continue;
    const coords = decodePolyline(pts);
    const isWalk = leg.mode === "WALK";

    const line = L.polyline(coords, {
      color:     colour,
      weight:    isWalk ? 3 : 5,
      opacity:   isWalk ? 0.5 : 0.9,
      dashArray: isWalk ? "6 8" : null,
    }).addTo(leafletMap);

    layers.push(line);
  }

  const first = itinerary.legs[0];
  const last  = itinerary.legs[itinerary.legs.length - 1];

  const dot = (c, big) => L.divIcon({
    className: "",
    html: `<span style="display:block;width:${big?14:10}px;height:${big?14:10}px;
      border-radius:50%;background:${c};border:2.5px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,.4)"></span>`,
    iconSize:   [big?14:10, big?14:10],
    iconAnchor: [big?7:5,   big?7:5],
  });

  layers.push(L.marker([first.from.lat, first.from.lon], { icon: dot(colour, false) }).addTo(leafletMap));
  layers.push(L.marker([last.to.lat,    last.to.lon   ], { icon: dot(colour, true)  }).addTo(leafletMap));

  return layers;
}

function fitMapToRoutes() {
  if (!window._leafletMap) return;
  const all = state.routes.flatMap(r => r.layers ?? []);
  if (!all.length) return;
  window._leafletMap.fitBounds(L.featureGroup(all).getBounds().pad(0.18));
}

function renderRouteList() {
  const list    = document.getElementById("routes-list");
  const section = document.getElementById("routes-section");
  list.innerHTML = "";

  if (state.routes.length === 0) {
    section.style.display                                     = "none";
    document.getElementById("map-empty").style.display       = "flex";
    document.getElementById("results-overlay").style.display = "none";
    return;
  }

  section.style.display                                     = "block";
  document.getElementById("map-empty").style.display       = "none";
  document.getElementById("results-overlay").style.display = "block";

  state.routes.forEach(route => {
    const colour = ROUTE_COLOURS[route.id % ROUTE_COLOURS.length];
    const km     = route.distanceKm != null ? route.distanceKm.toFixed(1) + " km" : "—";
    const modes  = route.itinerary ? describeModes(route.itinerary) : "";

    const item = document.createElement("div");
    item.className = "route-item";
    item.innerHTML = `
      <div class="route-item-header">
        <span class="route-colour-dot" style="background:${colour}"></span>
        <span class="route-label">${route.from} → ${route.to}</span>
        <button class="remove-route-btn" data-id="${route.id}" title="Remove">✕</button>
      </div>
      <div class="route-meta">
        <span class="route-distance">${km}</span>
        ${modes ? `<span class="route-modes">${modes}</span>` : ""}
      </div>`;
    list.appendChild(item);
  });

  list.querySelectorAll(".remove-route-btn").forEach(btn =>
    btn.addEventListener("click", () => removeRoute(Number(btn.dataset.id)))
  );

  renderOverlay();
  fitMapToRoutes();
}

function renderOverlay() {
  const inner = document.getElementById("overlay-inner");
  inner.innerHTML = "";
  state.routes.forEach(route => {
    const colour = ROUTE_COLOURS[route.id % ROUTE_COLOURS.length];
    const km     = route.distanceKm != null ? route.distanceKm.toFixed(1) : "—";
    const card   = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-card-dot" style="background:${colour}"></div>
      <div class="result-card-info">
        <div class="result-card-route">${route.from} → ${route.to}</div>
        <div class="result-card-km">${km} km <span class="result-card-transit">(transit)</span></div>
      </div>`;
    inner.appendChild(card);
  });
}

async function addRoute(fromName, toName, fromCoord, toCoord) {
  const id     = state.nextId++;
  const colour = ROUTE_COLOURS[id % ROUTE_COLOURS.length];

  state.routes.push({ id, from: fromName, to: toName, fromCoord, toCoord, distanceKm: null, itinerary: null, layers: [] });
  renderRouteList();
  setError("");
  setLoading(true);

  try {
    const itinerary = await fetchTransitRoute(fromCoord, toCoord);

    const distanceKm = haversineKm(fromCoord, toCoord);

    const entry = state.routes.find(r => r.id === id);
    if (!entry) return;

    entry.itinerary  = itinerary;
    entry.distanceKm = distanceKm;

    if (window._leafletMap) {
      entry.layers = drawItinerary(itinerary, colour, window._leafletMap);
      setTimeout(() => {
        window._leafletMap.invalidateSize();
        fitMapToRoutes();
        renderRouteList();
      }, 50);
    } else {
      renderRouteList();
    }
  } catch (err) {
    const idx = state.routes.findIndex(r => r.id === id);
    if (idx !== -1) state.routes.splice(idx, 1);
    setError(err.message || "Failed to fetch transit route.");
    renderRouteList();
  } finally {
    setLoading(false);
  }
}

function removeRoute(id) {
  const idx = state.routes.findIndex(r => r.id === id);
  if (idx === -1) return;
  const route = state.routes[idx];
  if (window._leafletMap && route.layers) route.layers.forEach(l => window._leafletMap.removeLayer(l));
  state.routes.splice(idx, 1);
  renderRouteList();
}

function clearAllRoutes() {
  if (window._leafletMap) state.routes.forEach(r => (r.layers ?? []).forEach(l => window._leafletMap.removeLayer(l)));
  state.routes = [];
  renderRouteList();
}

function setError(msg) {
  const el = document.getElementById("form-error");
  if (el) el.textContent = msg;
}

function setLoading(on) {
  const btn = document.getElementById("add-route-btn");
  if (!btn) return;
  btn.disabled    = on;
  btn.textContent = on ? "Routing…" : "Add Route";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("routes-section").style.display   = "none";
  document.getElementById("results-overlay").style.display  = "none";

  document.getElementById("add-route-btn").addEventListener("click", async () => {
    const fromName  = window._selectedFromName || (document.getElementById("from-input").value ?? "").trim();
    const toName    = window._selectedToName   || (document.getElementById("to-input").value   ?? "").trim();
    const fromCoord = window._selectedFrom;
    const toCoord   = window._selectedTo;

    if (!fromName || !toName)   { setError("Please enter both origin and destination."); return; }
    if (!fromCoord || !toCoord) { setError("Please select locations from the suggestions."); return; }

    await addRoute(fromName, toName, fromCoord, toCoord);

    document.getElementById("from-input").value = "";
    document.getElementById("to-input").value   = "";
    window._selectedFrom     = null;
    window._selectedTo       = null;
    window._selectedFromName = null;
    window._selectedToName   = null;
  });

  document.getElementById("clear-all-btn").addEventListener("click", clearAllRoutes);
});

window._routeState  = state;
window._removeRoute = removeRoute;
window._clearRoutes = clearAllRoutes;