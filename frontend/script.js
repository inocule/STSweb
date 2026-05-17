// Script.js

document.addEventListener("DOMContentLoaded", () => {

  // SEARCH & REDIRECT LOGIC
  const searchBtn = document.querySelector(".search-btn");
  const ctaBtn = document.querySelector(".cta-btn"); // Selected the big CTA button
  const input = document.querySelector("input");

  function handleSearch() {
    const location = input.value.trim();

    if (location === "") {
      // If empty, redirect to the map page showing everything
      window.location.href = "map.html";
    } else {
      // Redirect to map.html and pass the location text in the URL
      window.location.href = `map.html?search=${encodeURIComponent(location)}`;
    }
  }

  // Trigger when clicking the Search icon button
  if (searchBtn) {
    searchBtn.addEventListener("click", handleSearch);
  }

  // Trigger when clicking the "Search Dorms" CTA button
  if (ctaBtn) {
  ctaBtn.addEventListener("click", () => {
    window.location.href = "map.html";
  });
}
  // Optional: Trigger search when user hits "Enter" inside the text box
  if (input) {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    });
  }


  // MAP — only initialize if the #map element exists on this page
  const mapEl = document.getElementById("map");

  if (mapEl) {

    const map = L.map("map").setView([14.5995, 120.9842], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // PUP Main Campus marker
    L.marker([14.5995, 120.9842])
      .addTo(map)
      .bindPopup("<b>PUP Main Campus</b><br>Sta. Mesa, Manila")
      .openPopup();

    // Dorm markers
    const dorms = [
      { name: "Dorm A", lat: 14.6005, lng: 120.9830, price: "₱3,500/mo" },
      { name: "Dorm B", lat: 14.5980, lng: 120.9860, price: "₱4,200/mo" },
      { name: "Dorm C", lat: 14.6010, lng: 120.9855, price: "₱2,800/mo" },
    ];

    dorms.forEach(dorm => {
      L.marker([dorm.lat, dorm.lng])
        .addTo(map)
        .bindPopup(`<b>${dorm.name}</b><br>${dorm.price}`);
    });

  }

});
