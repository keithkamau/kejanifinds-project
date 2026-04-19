# KejaniFinds – Property Rental Website

## Overview

KejaniFinds is a web‑based property rental platform for Nairobi, Kenya. Landlords can list properties; tenants can search, view, and secure verified rentals. The platform integrates Auth0 (authentication), M‑Pesa (deposit escrow), WhatsApp Cloud API (notifications), and Nominatim (location autocomplete).

## Features

- User authentication (login / signup) via Auth0 (SPA SDK).
- Property listing form with:
  - Title, property type, bedrooms, bathrooms, size.
  - Location autocomplete (Nominatim / OpenStreetMap).
  - Rent, deposit, payment terms.
  - Amenities checklist (parking, security, gym, etc.).
  - Landlord WhatsApp and M‑Pesa numbers.
  - Photo upload (minimum 8 photos, front‑end preview only).
- Listings pages (`index.html`, `listings.html`) with static example cards.
- Search by estate, property type, and price range (front‑end only – requires backend).
- M‑Pesa STK Push simulation (sandbox) for deposit escrow.
- WhatsApp notifications for viewing requests, confirmations, escrow updates, maintenance alerts.
- Responsive design using custom CSS (Playfair and Inter fonts).

## Project Structure

KejaniFinds
├── index.html # Homepage with hero and featured listings
├── listings.html # All available listings
├── saved-listings.html # Placeholder for saved listings
├── login.html # Auth0 login / signup page
├── new-listing-form.html # Multi‑section listing submission form
├── callback.html # Optional – not required if login.html handles callback
├── styles/
│ ├── styles.css # Global styles (navbar, cards, footer)
│ ├── form-style.css # Listing form specific styles
│ └── login-styles.css # Login page styles
├── images/ # Logo, property photos (house1.jpg – house6.jpg), city‑skyline.jpg
├── icons/ # SVG icons (email, phone, whatsapp, verified, 24hr‑support, etc.)
├── auth.js # Auth0 initialisation and authentication logic
├── script.js # M‑Pesa, WhatsApp, Nominatim, and listing form logic
└── README.md

## Prerequisites

- A local HTTP server (e.g., `http-server`, Live Server, Python `http.server`).
- Auth0 account (free tier).
- (Optional) Safaricom M‑Pesa Developer account for sandbox testing.
- (Optional) Facebook Developer account for WhatsApp Cloud API.
- Modern browser with JavaScript enabled.

## Setup Instructions

### 1. Serve the project locally

You must serve the files over HTTP, not from the file system (`file://`). Example using `http-server`:

```bash
npx http-server -p 3000 -a localhost -c-1

```

The application will be available at <http://localhost:3000>.

### 2.Configure Auth0 (mandatory)

1. Log in to your Auth0 dashboard.

2. Create a Single Page Web Application.

3. Note your Domain (e.g., dev-xxx.us.auth0.com) and Client ID.

4. Under Application Settings, configure:

  - Allowed Callback URLs: <http://localhost:3000/login.html> (adjust port if needed)

  - Allowed Logout URLs: <http://localhost:3000>

  - Allowed Web Origins: <http://localhost:3000>

 5. Save the changes.
 6. Open auth.js and replace the placeholder values:

```
const AUTH0_CONFIG = {
  domain: 'dev-xxx.us.auth0.com',      // your Auth0 domain
  clientId: 'your-client-id',          // your Auth0 client ID
  redirectUri: window.location.origin + '/login.html',
};

```

### 3. (Optional) Configure M‑Pesa Daraja API

The script.js file contains functions for STK push, payment status polling, and B2C escrow release. For sandbox testing:

1. Register at the Safaricom Developer Portal.

2. Create an app to obtain Consumer Key and Consumer Secret.

3. Use the sandbox shortcode (e.g., 174379) and passkey.

4. Replace the placeholders in MPESA_CONFIG:

```
const MPESA_CONFIG = {
  consumerKey:      "YOUR_CONSUMER_KEY",
  consumerSecret:   "YOUR_CONSUMER_SECRET",
  shortCode:        "174379",                 // sandbox paybill
  passkey:          "YOUR_PASSKEY",
  b2cInitiatorName: "testapi",
  b2cSecurityCred:  "YOUR_ENCRYPTED_CRED",
  stkCallbackUrl:   "https://your-backend.com/mpesa/stk-callback",
  b2cTimeoutUrl:    "https://your-backend.com/mpesa/b2c-timeout",
  b2cResultUrl:     "https://your-backend.com/mpesa/b2c-result",
  environment:      "sandbox",
};
```

### 4. (Optional) Configure WhatsApp Cloud API

1. Create a Meta App and obtain a WhatsApp Business phone number.

2. Get the Phone Number ID and Access Token.

3. Update WHATSAPP_CONFIG in script.js:

```
const WHATSAPP_CONFIG = {
  accessToken:   "YOUR_WHATSAPP_ACCESS_TOKEN",
  phoneNumberId: "YOUR_PHONE_NUMBER_ID",
  apiVersion:    "v19.0",
  baseUrl:       "https://graph.facebook.com",
};
```

### 5. Run the application
Start your HTTP server as shown in step 1. Open http://localhost:3000/index.html.

### Usage
#### For tenants (browsing)
- Navigate to the homepage or listings.html to see example properties.

- Use the search fields (estate, type, price) – currently no backend, so filtering does nothing.

#### For landlords (posting a listing)
- Click Post a listing button (visible in the navbar on all pages).

- You will be redirected to Auth0 login/signup (unless already logged in).

- After successful authentication, you are taken to new-listing-form.html.

- Fill in all required fields:
  - Property details (title, type, bedrooms, bathrooms, size).
  - Location – start typing an estate name; suggestions appear from Nominatim. Select one to auto‑fill coordinates.
  - Pricing (monthly rent, deposit, payment terms).
  - Amenities (checkboxes).
  - WhatsApp number and M‑Pesa number (for escrow).
  - Description.
  - Photos – select at least 8 images (preview only, no upload to server).

- Click Post listing – the form data will be logged to the browser console (no backend yet). A real implementation would send the data to a server.

### Authentication Flow (Auth0)
- auth.js initialises the Auth0 client using the SPA SDK.

- On login.html, the script checks for an existing session. If authenticated, it shows a welcome message and a logout button; otherwise, it shows Login and Signup buttons.

- Login / Signup redirects to Auth0 Universal Login.

- After successful authentication, Auth0 redirects back to login.html with code and state parameters. The callback is handled inside auth.js using handleRedirectCallback().

- The user’s profile and access token are stored in sessionStorage (kejani_user, kejani_token).

- The "Post a listing" button on index.html and listings.html checks window.auth0Client.isAuthenticated() before allowing access. If not logged in, the user is sent to login.html with a redirect target stored.

### Important Notes
- No backend: The current implementation is front‑end only. M‑Pesa, WhatsApp, and listing submission require a backend server to handle API secrets, callbacks, and data persistence.

- M‑Pesa callbacks: The STK push callback URL must be publicly accessible. For local testing, use a tool like ngrok to expose your local server.

- Nominatim rate limiting: The free Nominatim service allows 1 request per second. The code enforces a 1000 ms delay. For production, obtain a commercial geocoding API.

- Photo uploads: The form allows selecting multiple images, but they are not sent anywhere. A production system should upload them to cloud storage (e.g., AWS S3, Cloudinary).

- Static listings: All listings on index.html and listings.html are hardcoded examples. Replace with dynamic data from a database.

- Saved listings: saved-listings.html is a placeholder – no functionality implemented.

### Troubleshooting
#### Auth0 does not load / “Auth0 SDK not loaded”
- Make sure you are accessing the page via http:// and not file://.

- Check the browser console for errors. Common issues:

  - Incorrect callback URL in Auth0 dashboard (must exactly match http://localhost:3000/login.html).

  - Network block – verify the CDN script URL is reachable: https://cdn.auth0.com/js/auth0-spa-js/2.18/auth0-spa-js.production.js.

- Confirm that you have set Allowed Web Origins to your local server address.

#### Location autocomplete does not work
- The estate input field must have id="input-estate". It exists in new-listing-form.html.

- Ensure script.js is loaded and that the attachLocationAutofill() function runs after the DOM is ready (it does via DOMContentLoaded).

- Some browsers or extensions may block requests to nominatim.openstreetmap.org. Check the network tab.

#### M‑Pesa STK push fails with “Invalid Consumer Key” or “Invalid Access Token”
- Use sandbox credentials only. Production credentials require a different endpoint and live shortcode.

- The access token is obtained automatically by getMpesaToken(). If this fails, verify your consumer key/secret and that the environment is set to sandbox.

- The callback URL must be HTTPS for production; for sandbox, HTTP may work but Safaricom recommends HTTPS.

#### WhatsApp messages are not sent
- The access token and phone number ID must be from a valid WhatsApp Business App with an approved phone number.

- The recipient phone number must be opted in (have sent a message to the business first, or use a test number in sandbox mode).

### Future Improvements
- Backend API (Node.js + Express) to handle:
  - User roles (tenant / landlord / admin).
  - Listing CRUD operations with database (PostgreSQL / MongoDB).
  - Secure storage of M‑Pesa and WhatsApp credentials.
  - Actual STK push callback handling and escrow ledger.
  - Image upload to cloud storage.

- Real search and filtering with server‑side pagination.

- Map view for listings.

- Tenant‑landlord chat system.

- Admin verification dashboard.

Automated deposit release after tenant confirmation.
