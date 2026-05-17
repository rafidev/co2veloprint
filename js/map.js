// add the map
const map = L.map('map').setView([48.2082, 16.3738], 5); // Defaults to Vienna, Austria at zoom level 5

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

