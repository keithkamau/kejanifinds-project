// Wait for DOM and data to be ready
document.addEventListener('DOMContentLoaded', function () {
  // Get listing ID from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const listingId = urlParams.get('id');

  // DOM elements
  const loadingDiv = document.getElementById('listing-loading');
  const notFoundDiv = document.getElementById('listing-not-found');
  const contentDiv = document.getElementById('listing-content');

  // Helper to hide loading and show either content or not-found
  function showContent() {
    loadingDiv.classList.add('hidden');
    contentDiv.classList.remove('hidden');
  }

  function showNotFound() {
    loadingDiv.classList.add('hidden');
    notFoundDiv.classList.remove('hidden');
  }

  // Find listing
  const listing = LISTINGS_DATA.find(item => item.id === listingId);

  if (!listing) {
    showNotFound();
    return;
  }

  // --- Populate basic details ---
  document.getElementById('ld-title').textContent = listing.title;
  document.getElementById('ld-location').textContent = listing.location;
  document.getElementById('ld-price').textContent = `Ksh ${listing.price.toLocaleString()}`;
  document.getElementById('ld-description').textContent = listing.description;

  // Deposit in booking panel
  document.getElementById('bp-price').textContent = `Ksh ${listing.price.toLocaleString()}`;
  document.getElementById('bp-deposit').textContent = `Ksh ${listing.deposit.toLocaleString()}`;

  // Badges (verified, inspected, new)
  const badgesContainer = document.getElementById('ld-badges');
  badgesContainer.innerHTML = '';
  if (listing.verified) {
    const verifiedBadge = document.createElement('span');
    verifiedBadge.className = 'badge verified';
    verifiedBadge.textContent = '✓ Verified';
    badgesContainer.appendChild(verifiedBadge);
  }
  if (listing.inspected) {
    const inspectedBadge = document.createElement('span');
    inspectedBadge.className = 'badge inspected';
    inspectedBadge.textContent = 'Inspected';
    badgesContainer.appendChild(inspectedBadge);
  }
  if (listing.isNew) {
    const newBadge = document.createElement('span');
    newBadge.className = 'badge new';
    newBadge.textContent = 'New';
    badgesContainer.appendChild(newBadge);
  }

  // Quick stats (beds, baths, size)
  const statsContainer = document.getElementById('ld-stats');
  statsContainer.innerHTML = `
    <div class="stat">
      <span class="stat-value">${listing.beds}</span>
      <span class="stat-label">Bed${listing.beds !== 1 ? 's' : ''}</span>
    </div>
    <div class="stat">
      <span class="stat-value">${listing.baths}</span>
      <span class="stat-label">Bath${listing.baths !== 1 ? 's' : ''}</span>
    </div>
    <div class="stat">
      <span class="stat-value">${listing.size}</span>
      <span class="stat-label">Area</span>
    </div>
  `;

  // Amenities
  const amenitiesContainer = document.getElementById('ld-amenities');
  amenitiesContainer.innerHTML = '';
  listing.amenities.forEach(amenity => {
    const amenitySpan = document.createElement('span');
    amenitySpan.className = 'amenity';
    amenitySpan.textContent = amenity;
    amenitiesContainer.appendChild(amenitySpan);
  });

  // Agent info
  const agentContainer = document.getElementById('ld-agent');
  agentContainer.innerHTML = `
    <img src="https://www.svgrepo.com/show/415616/basic-profile-ui.svg" alt="Agent" class="agent-avatar">
    <div class="agent-info">
      <strong>${listing.agent.name}</strong>
      <span>${listing.agent.phone}</span>
    </div>
  `;

  // --- Photo gallery ---
  const images = listing.images.length ? listing.images : ['images/placeholder.jpg'];
  let currentImageIndex = 0;
  const mainImg = document.getElementById('gallery-main-img');
  const thumbsContainer = document.getElementById('gallery-thumbs');
  const counterSpan = document.getElementById('gallery-counter');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');

  function updateGallery() {
    mainImg.src = images[currentImageIndex];
    counterSpan.textContent = `${currentImageIndex + 1} / ${images.length}`;

    // Update active thumbnail
    document.querySelectorAll('.thumb-img').forEach((thumb, idx) => {
      if (idx === currentImageIndex) {
        thumb.classList.add('active');
      } else {
        thumb.classList.remove('active');
      }
    });
  }

  function buildThumbnails() {
    thumbsContainer.innerHTML = '';
    images.forEach((imgSrc, idx) => {
      const thumb = document.createElement('img');
      thumb.src = imgSrc;
      thumb.classList.add('thumb-img');
      if (idx === currentImageIndex) thumb.classList.add('active');
      thumb.addEventListener('click', () => {
        currentImageIndex = idx;
        updateGallery();
      });
      thumbsContainer.appendChild(thumb);
    });
  }

  if (images.length > 0) {
    buildThumbnails();
    mainImg.src = images[0];
    counterSpan.textContent = `1 / ${images.length}`;
  }

  prevBtn.addEventListener('click', () => {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    updateGallery();
  });

  nextBtn.addEventListener('click', () => {
    currentImageIndex = (currentImageIndex + 1) % images.length;
    updateGallery();
  });

  // --- Booking form (WhatsApp) ---
  const bookingForm = document.getElementById('booking-form');
  const bookingError = document.getElementById('booking-error');
  const bookingSuccess = document.getElementById('booking-success');

  bookingForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('bp-name').value.trim();
    const phoneRaw = document.getElementById('bp-phone').value.trim();
    const date = document.getElementById('bp-date').value;
    const time = document.getElementById('bp-time').value;
    const message = document.getElementById('bp-message').value.trim();

    // Validation
    if (!name || !phoneRaw || !date || !time) {
      bookingError.textContent = 'Please fill in all required fields.';
      bookingError.classList.remove('hidden');
      bookingSuccess.classList.add('hidden');
      return;
    }

    // Format phone: assume user enters 712345678 (without +254)
    const fullPhone = `+254${phoneRaw.replace(/\D/g, '')}`;
    if (fullPhone.length < 12) {
      bookingError.textContent = 'Please enter a valid WhatsApp number (e.g. 712345678).';
      bookingError.classList.remove('hidden');
      bookingSuccess.classList.add('hidden');
      return;
    }

    // Build WhatsApp message
    const landlordPhone = listing.landlordPhone.startsWith('+') ? listing.landlordPhone : `+${listing.landlordPhone}`;
    const propertyLink = window.location.href;

    let waMessage = `🏠 *Viewing Request*\n\n`;
    waMessage += `*Property:* ${listing.title} (${listing.location})\n`;
    waMessage += `*Price:* Ksh ${listing.price.toLocaleString()}/month\n`;
    waMessage += `*Name:* ${name}\n`;
    waMessage += `*Preferred Date:* ${date}\n`;
    waMessage += `*Preferred Time:* ${time}\n`;
    if (message) waMessage += `*Message:* ${message}\n`;
    waMessage += `\nView property: ${propertyLink}`;

    const encodedMessage = encodeURIComponent(waMessage);
    const waUrl = `https://wa.me/${landlordPhone}?text=${encodedMessage}`;

    // Show success UI (no actual API call, just redirect)
    bookingError.classList.add('hidden');
    bookingSuccess.classList.remove('hidden');
    bookingForm.reset();

    // Open WhatsApp after a short delay so user sees the success message
    setTimeout(() => {
      window.open(waUrl, '_blank');
    }, 800);
  });

  // --- Finally, show the content ---
  showContent();
});