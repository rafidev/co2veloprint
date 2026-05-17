document.addEventListener('DOMContentLoaded', () => {
  setupAutocomplete('from-input', 'from-dd');
  setupAutocomplete('to-input', 'to-dd');
});

function setupAutocomplete(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (query.length < 3) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchPlaces(query, dropdown, input);
    }, 400); 
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    }
  });
}

async function fetchPlaces(query, dropdown, input) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    const data = await response.json();

    renderDropdown(data, dropdown, input);
  } catch (error) {
    console.error('Error fetching places:', error);
  }
}

function renderDropdown(places, dropdown, input) {
  dropdown.innerHTML = '';

  if (places.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  places.forEach(place => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = place.display_name;

    item.dataset.lat = place.lat;
    item.dataset.lon = place.lon;

    item.addEventListener('click', () => {
      input.value = place.display_name;
      
      input.dataset.lat = place.lat;
      input.dataset.lon = place.lon;

      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}