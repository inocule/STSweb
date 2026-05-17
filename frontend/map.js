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
  const map = L.map('map').setView(PUP, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Custom Icon Configurator using your uploaded assets
  const userIcon = L.icon({
    iconUrl: './Images/red.webp',      // PUP Main Campus
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });

  const availIcon = L.icon({
    iconUrl: './Images/green.webp',    // Available Dorms
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });

  const fullIcon = L.icon({
    iconUrl: './Images/blue.webp',     // Full / Fully Booked Dorms
    iconSize: [60, 66],
    iconAnchor: [19, 42],
    popupAnchor: [0, -42]
  });
  // PUP marker
  L.marker(PUP, { icon: userIcon }).addTo(map)
    .bindPopup('<b>PUP Main Campus</b><br>Sta. Mesa, Manila').openPopup();

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
      const res = await fetch(`http://localhost:3000/api/dorms?${params}`);
      allDorms = await res.json();
    } catch {
      // Fallback to demo data if backend not running
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
    // Clear old markers
    dormMarkers.forEach(m => map.removeLayer(m));
    dormMarkers = [];

    const list = document.querySelector('.property-list');
    const count = document.querySelector('.results-count p');
    list.innerHTML = '';
    count.textContent = `${dorms.length} propert${dorms.length !== 1 ? 'ies' : 'y'} found`;

    dorms.forEach(dorm => {
      const dist = haversine(PUP[0], PUP[1], dorm.lat, dorm.lng);
      const icon = dorm.status === 'available' ? availIcon : fullIcon;

      // Map marker
      const marker = L.marker([dorm.lat, dorm.lng], { icon }).addTo(map)
        .bindPopup(`
          <b>${dorm.name}</b><br>
          ₱${Number(dorm.price).toLocaleString()}/mo<br>
          Status: <b>${dorm.status}</b><br>
          ${dist.toFixed(1)} km from PUP
        `);
      dormMarkers.push(marker);

      // Sidebar card
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

    // Contact Owner buttons
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

  // ─── My Location button ─────────────────────────────────────────────────────
  document.querySelector('.my-location-btn').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.flyTo([coords.latitude, coords.longitude], 16);
      L.marker([coords.latitude, coords.longitude], { icon: userIcon }).addTo(map)
        .bindPopup('<b>You are here</b>').openPopup();
    }, () => alert('Could not get your location.'));
  });

  // ─── Search / Filter ────────────────────────────────────────────────────────
  function applyFilters() {
    const minPrice = document.querySelectorAll('.price-inputs input')[0].value;
    const maxPrice = document.querySelectorAll('.price-inputs input')[1].value;
    const maxDist  = document.querySelector('.filter-group > input[type="text"]:not(.input-with-icon input)') ||
                     document.querySelectorAll('.filter-group > input')[0];
    const activePills = [...document.querySelectorAll('.pill.active')].map(p => p.textContent.trim());

    loadDorms({
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
      amenities: activePills,
      lat: PUP[0], lng: PUP[1],
      maxDistance: maxDist?.value || null
    });
  }

  document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => setTimeout(applyFilters, 50)));
  document.querySelectorAll('.price-inputs input').forEach(i => i.addEventListener('change', applyFilters));

  // Initial load
  await loadDorms({ lat: PUP[0], lng: PUP[1] });
});