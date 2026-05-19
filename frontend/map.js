// frontend/map.js — Live dorm map powered by the RooME API

document.addEventListener('DOMContentLoaded', async () => {
  // Update navbar for logged-in users
  if (typeof updateNavbar === 'function') updateNavbar();

  // ─── Filter Pills ───────────────────────────────────────────────────────────
  const pills = document.querySelectorAll('.pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('active'));
  });

  // ─── Map Init ───────────────────────────────────────────────────────────────
  const PUP = [14.598074540708227, 121.01112037559832];
  let searchCenter = [...PUP]; // tracks the active search center

  const map = L.map('map').setView(PUP, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // ─── Icons ─────────────────────────────────────────────────────────────────
  const userIcon = L.icon({
    iconUrl: './Images/red.webp',
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });
  const availIcon = L.icon({
    iconUrl: './Images/green.webp',
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });
  const fullIcon = L.icon({
    iconUrl: './Images/blue.webp',
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });

  // PUP campus marker
  L.marker(PUP, { icon: userIcon }).addTo(map)
    .bindPopup('<b>PUP Main Campus</b><br>Sta. Mesa, Manila').openPopup();

  // ─── Toast ──────────────────────────────────────────────────────────────────
  const toast = document.getElementById('map-toast');
  let toastTimer;
  function showToast(msg, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `map-toast ${isError ? 'toast-error' : 'toast-info'}`;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  // ─── Load & Render Dorms ────────────────────────────────────────────────────
  let dormMarkers = [];
  let allDorms = [];

  async function loadDorms(filters = {}) {
    const params = new URLSearchParams();
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.amenities?.length) params.set('amenities', filters.amenities.join(','));
    if (filters.status) params.set('status', filters.status);
    if (filters.lat) { params.set('lat', filters.lat); params.set('lng', filters.lng); }
    if (filters.maxDistance) params.set('maxDistance', filters.maxDistance);

    try {
      const qs = params.toString();
      allDorms = await apiFetch('/dorms' + (qs ? '?' + qs : ''));
    } catch {
      // Fallback demo data when backend is offline
      allDorms = [
        { id: 1, name: 'Campus Heights', lat: 14.6015, lng: 120.9830, price: 4000, status: 'available',
          amenities: ['WiFi','Parking'], image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=300', owner_id: 1, owner_name: 'Demo Owner' },
        { id: 2, name: 'The Cozy Place', lat: 14.5980, lng: 120.9860, price: 3500, status: 'full',
          amenities: ['AC','Kitchen'], image_url: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=300', owner_id: 1, owner_name: 'Demo Owner' },
        { id: 3, name: 'Student Haven', lat: 14.6020, lng: 120.9855, price: 2000, status: 'available',
          amenities: ['WiFi','AC','Kitchen'], image_url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=300', owner_id: 1, owner_name: 'Demo Owner' },
      ];
    }

    renderDorms(allDorms);
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function renderDorms(dorms) {
    dormMarkers.forEach(m => map.removeLayer(m));
    dormMarkers = [];

    const list = document.querySelector('.property-list');
    const count = document.querySelector('.results-count p');
    list.innerHTML = '';
    count.textContent = `${dorms.length} propert${dorms.length !== 1 ? 'ies' : 'y'} found`;

    dorms.forEach(dorm => {
      const dist = haversine(searchCenter[0], searchCenter[1], dorm.lat, dorm.lng);
      const icon = dorm.status === 'available' ? availIcon : fullIcon;

      const marker = L.marker([dorm.lat, dorm.lng], { icon }).addTo(map)
        .bindPopup(`
          <b>${dorm.name}</b><br>
          ₱${Number(dorm.price).toLocaleString()}/mo<br>
          Status: <b>${dorm.status}</b><br>
          ${dist.toFixed(1)} km from search point
        `);
      dormMarkers.push(marker);

      const amenitiesHtml = (dorm.amenities || []).map(a =>
        `<span class="small-pill">${a}</span>`
      ).join('');

      const card = document.createElement('div');
      card.className = 'property-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <img src="${dorm.image_url || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=300'}" alt="${dorm.name}" onerror="this.src='https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=300'">
        <div class="property-info">
          <div class="prop-header">
            <h3>${dorm.name}</h3>
            <span class="status-badge ${dorm.status === 'available' ? 'available' : 'full'}">
              ${dorm.status === 'available' ? 'Available' : 'Full'}
            </span>
          </div>
          <div class="prop-price-dist">
            <span class="price">₱${Number(dorm.price).toLocaleString()}/mo</span>
            <span class="dist"><i class="fa-solid fa-location-dot"></i> ${dist.toFixed(1)} km</span>
          </div>
          <div class="prop-amenities">${amenitiesHtml}</div>
          <div class="prop-owner">
            <i class="fa-regular fa-user"></i> ${dorm.owner_name || 'Unknown Owner'}
          </div>
          <button class="contact-btn" data-owner="${dorm.owner_id}" data-dorm="${dorm.id}" data-name="${dorm.name}"
            style="margin-top:8px;background:#800020;color:white;border:none;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;transition:0.2s;"
            onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'">
            <i class="fa-solid fa-message"></i> Contact Owner
          </button>
        </div>`;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.contact-btn')) return;
        marker.openPopup();
        map.flyTo([dorm.lat, dorm.lng], 16, { duration: 0.8 });
      });

      list.appendChild(card);
    });

    // Contact owner buttons
    document.querySelectorAll('.contact-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const user = (typeof getUser === 'function') ? getUser() : null;
        if (!user) {
          alert('Please sign in to contact the owner.');
          window.location.href = 'signin.html';
          return;
        }
        const ownerId = btn.dataset.owner;
        const dormId  = btn.dataset.dorm;
        const dormName = btn.dataset.name;
        window.location.href = `chat.html?to=${ownerId}&dorm=${dormId}&dormName=${encodeURIComponent(dormName)}`;
      });
    });
  }

  // ─── Geocoding (Nominatim) ──────────────────────────────────────────────────

  /**
   * Forward geocode: text → [{lat, lon, display_name}]
   * Scoped to Philippines (countrycodes=ph).
   * Nominatim ToS: max 1 req/sec — enforced via 400ms debounce.
   */
  async function geocodeLocation(query) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('countrycodes', 'ph');
    url.searchParams.set('limit', '6');
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'RooME-DormFinder/1.0'
      }
    });
    if (!res.ok) throw new Error('Nominatim error');
    return res.json();
  }

  /**
   * Reverse geocode: lat/lng → display address string
   */
  async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'RooME-DormFinder/1.0'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  }

  // ─── Search UI wiring ───────────────────────────────────────────────────────
  const locationInput   = document.getElementById('location-search');
  const suggestionsList = document.getElementById('geocode-suggestions');
  const clearBtn        = document.getElementById('geocode-clear');
  const searchAreaBtn   = document.getElementById('search-area-btn');

  let searchMarker = null;
  let debounceTimer = null;
  let activeSuggestionIndex = -1;
  let currentSuggestions = [];
  let isSearching = false;

  function hideSuggestions() {
    suggestionsList.classList.add('hidden');
    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;
    currentSuggestions = [];
  }

  function showSuggestions(results) {
    suggestionsList.innerHTML = '';
    if (!results.length) {
      suggestionsList.innerHTML = '<li class="no-results">No locations found in the Philippines.</li>';
      suggestionsList.classList.remove('hidden');
      return;
    }

    // ── Deduplicate by display_name (Nominatim often returns the same
    //    place as both a node and a relation / building polygon)
    const seen = new Set();
    const unique = results.filter(r => {
      const key = r.display_name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    currentSuggestions = unique;
    unique.forEach((r, i) => {
      const li = document.createElement('li');
      const addr = r.address || {};
      const primary = r.namedetails?.name || r.display_name.split(',')[0];

      // Build secondary: road/neighbourhood → city/town → state
      // This distinguishes entries with the same name but different streets
      const street = addr.road || addr.neighbourhood || addr.suburb || addr.quarter || null;
      const city   = addr.city || addr.town || addr.municipality || addr.village || null;
      const secondary = [street, city, addr.state].filter(Boolean).join(', ');
      li.innerHTML = `
        <div class="suggest-row">
          <i class="fa-solid fa-location-dot suggest-icon"></i>
          <span class="suggest-primary">${primary}</span>
        </div>
        ${secondary ? `<span class="suggest-secondary">${secondary}</span>` : ''}
      `;
      li.setAttribute('role', 'option');
      li.dataset.index = i;
      li.addEventListener('mousedown', () => selectSuggestion(i));
      suggestionsList.appendChild(li);
    });
    suggestionsList.classList.remove('hidden');
    activeSuggestionIndex = -1;
  }

  function highlightSuggestion(index) {
    const items = suggestionsList.querySelectorAll('li:not(.no-results)');
    items.forEach((li, i) => li.classList.toggle('active', i === index));
    activeSuggestionIndex = index;
  }

  function selectSuggestion(index) {
    const result = currentSuggestions[index];
    if (!result) return;
    locationInput.value = result.display_name.split(',').slice(0, 2).join(',');
    clearBtn.classList.remove('hidden');
    hideSuggestions();
    flyToResult(result);
  }

  function flyToResult(result) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    searchCenter = [lat, lng];

    // Place a search pin
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([lat, lng], { icon: userIcon })
      .addTo(map)
      .bindPopup(`<b>${result.display_name.split(',')[0]}</b><br>${result.display_name.split(',').slice(1,3).join(',').trim()}`)
      .openPopup();

    map.flyTo([lat, lng], 15, { duration: 1 });

    // Reload dorms centered on new location
    const maxDist = getCurrentMaxDistance() || 5;
    loadDorms({ lat, lng, maxDistance: maxDist, ...getActiveFilters() });

    showToast(`Showing dorms near ${result.display_name.split(',')[0]}`);
  }

  // ─── Debounced autocomplete ──────────────────────────────────────────────────
  locationInput.addEventListener('input', () => {
    const q = locationInput.value.trim();
    clearBtn.classList.toggle('hidden', !q);

    if (q.length < 3) { hideSuggestions(); return; }

    clearTimeout(debounceTimer);
    // Show a subtle loading state
    suggestionsList.innerHTML = '<li class="searching">Searching…</li>';
    suggestionsList.classList.remove('hidden');

    debounceTimer = setTimeout(async () => {
      if (isSearching) return;
      isSearching = true;
      try {
        const results = await geocodeLocation(q);
        showSuggestions(results);
      } catch {
        showToast('Location search failed. Check your connection.', true);
        hideSuggestions();
      } finally {
        isSearching = false;
      }
    }, 400); // 400ms respects Nominatim's 1 req/sec limit
  });

  // Keyboard navigation through suggestions
  locationInput.addEventListener('keydown', (e) => {
    const items = suggestionsList.querySelectorAll('li:not(.no-results):not(.searching)');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightSuggestion(Math.min(activeSuggestionIndex + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightSuggestion(Math.max(activeSuggestionIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0) {
        selectSuggestion(activeSuggestionIndex);
      } else if (locationInput.value.trim().length >= 3) {
        // Search with whatever is typed
        performDirectSearch(locationInput.value.trim());
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  locationInput.addEventListener('blur', () => {
    // Small delay so mousedown on suggestion fires first
    setTimeout(hideSuggestions, 200);
  });

  async function performDirectSearch(q) {
    hideSuggestions();
    showToast('Searching…');
    try {
      const results = await geocodeLocation(q);
      if (!results.length) {
        showToast('No locations found. Try a broader term.', true);
        return;
      }
      flyToResult(results[0]);
    } catch {
      showToast('Location search failed. Try panning the map manually.', true);
    }
  }

  // Clear button
  clearBtn.addEventListener('click', () => {
    locationInput.value = '';
    clearBtn.classList.add('hidden');
    hideSuggestions();
    searchCenter = [...PUP];
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
    map.flyTo(PUP, 15, { duration: 0.8 });
    loadDorms({ lat: PUP[0], lng: PUP[1], ...getActiveFilters() });
    showToast('Reset to PUP Main Campus');
  });

  // ─── "Search This Area" floating button ─────────────────────────────────────
  let moveTimer;
  map.on('movestart', () => {
    clearTimeout(moveTimer);
    searchAreaBtn.classList.add('hidden');
  });
  map.on('moveend', () => {
    // Only show after a deliberate user pan (not our own flyTo)
    moveTimer = setTimeout(() => searchAreaBtn.classList.remove('hidden'), 600);
  });

  searchAreaBtn.addEventListener('click', () => {
    searchAreaBtn.classList.add('hidden');
    const center = map.getCenter();
    searchCenter = [center.lat, center.lng];

    // Estimate visible radius from zoom level
    const zoom = map.getZoom();
    const radiusKm = zoom >= 16 ? 1 : zoom >= 14 ? 3 : zoom >= 12 ? 8 : 20;

    loadDorms({ lat: center.lat, lng: center.lng, maxDistance: radiusKm, ...getActiveFilters() });
    showToast(`Showing dorms within ${radiusKm} km of map center`);
  });

  // ─── My Location (with reverse geocoding) ───────────────────────────────────
  document.querySelector('.my-location-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', true);
      return;
    }
    showToast('Getting your location…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const { latitude, longitude } = coords;
      searchCenter = [latitude, longitude];

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([latitude, longitude], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>You are here</b>')
        .openPopup();

      map.flyTo([latitude, longitude], 16, { duration: 1 });

      // Reverse geocode to fill search box
      const address = await reverseGeocode(latitude, longitude);
      if (address) {
        locationInput.value = address.split(',').slice(0, 2).join(',');
        clearBtn.classList.remove('hidden');
        searchMarker.setPopupContent(`<b>You are here</b><br>${address.split(',').slice(0,2).join(',')}`).openPopup();
      }

      loadDorms({ lat: latitude, lng: longitude, maxDistance: 3, ...getActiveFilters() });
      showToast('Showing dorms near your location');
    }, (err) => {
      const msg = err.code === 1 ? 'Location access denied.' : 'Could not get your location.';
      showToast(msg, true);
    });
  });

  // ─── Filter helpers ──────────────────────────────────────────────────────────
  function getCurrentMaxDistance() {
    const inp = document.querySelector('.filter-group > input[type="text"][placeholder="Enter max distance"]');
    return inp ? (parseFloat(inp.value) || null) : null;
  }

  function getActiveFilters() {
    const priceInputs = document.querySelectorAll('.price-inputs input');
    const minPrice = priceInputs[0]?.value || null;
    const maxPrice = priceInputs[1]?.value || null;
    const activePills = [...document.querySelectorAll('.pill.active')].map(p => p.textContent.trim());
    const maxDistance = getCurrentMaxDistance();
    return { minPrice, maxPrice, amenities: activePills, maxDistance };
  }

  function applyFilters() {
    const f = getActiveFilters();
    loadDorms({ lat: searchCenter[0], lng: searchCenter[1], ...f });
  }

  // ─── Apply-Filters button (primary search trigger) ─────────────────────────
  document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);

  // Pills: toggle highlight only — button press searches
  document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => {
    // visual toggle is already handled by the pill click listener above
    // no auto-search; user presses Find Dorms
  }));

  // Allow Enter key on price / distance inputs to trigger the button too
  document.querySelectorAll('.price-inputs input, .filter-group > input[type="text"]').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
    });
  });

  // ─── Initial load ────────────────────────────────────────────────────────────
  await loadDorms({ lat: PUP[0], lng: PUP[1] });
});