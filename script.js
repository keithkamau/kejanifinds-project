// MPesa Daraja API
const MPESA_CONFIG = {
  consumerKey:      "YOUR_CONSUMER_KEY",
  consumerSecret:   "YOUR_CONSUMER_SECRET",
  shortCode:        "YOUR_PAYBILL_OR_TILL_NUMBER",
  passkey:          "YOUR_MPESA_PASSKEY",
  b2cInitiatorName: "YOUR_INITIATOR_NAME",
  b2cSecurityCred:  "YOUR_ENCRYPTED_SECURITY_CRED",

  stkCallbackUrl:   "https://api.kejafinds.co.ke/mpesa/stk-callback",
  b2cTimeoutUrl:    "https://api.kejafinds.co.ke/mpesa/b2c-timeout",
  b2cResultUrl:     "https://api.kejafinds.co.ke/mpesa/b2c-result",

  environment: "sandbox",

  get baseUrl() {
    return this.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  },
};

const tokenCache = { value: null, expiresAt: 0 };

async function getMpesaToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const credentials = btoa(
    `${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`
  );

  const response = await fetch(
    `${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type":  "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Failed to get M-Pesa access token");
  }

  tokenCache.value     = data.access_token;
  tokenCache.expiresAt = Date.now() + 55 * 60 * 1000;

  return tokenCache.value;
}

function generateStkPassword(timestamp) {
  return btoa(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`);
}

function getMpesaTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}

async function initiateStkPush(depositDetails) {
  const { tenantPhone, amount, listingId, listingTitle } = depositDetails;

  const token     = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const password  = generateStkPassword(timestamp);
  const phone     = tenantPhone.replace(/^\+/, "").replace(/^0/, "254");

  const payload = {
    BusinessShortCode: MPESA_CONFIG.shortCode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            Math.round(amount),
    PartyA:            phone,
    PartyB:            MPESA_CONFIG.shortCode,
    PhoneNumber:       phone,
    CallBackURL:       MPESA_CONFIG.stkCallbackUrl,
    AccountReference:  listingId,
    TransactionDesc:   `KejaFinds deposit – ${listingTitle}`.slice(0, 13),
  };

  const response = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok || data.ResponseCode !== "0") {
    return {
      success:             false,
      responseCode:        data.ResponseCode,
      responseDescription: data.ResponseDescription || "STK Push failed",
    };
  }

  return {
    success:             true,
    checkoutRequestId:   data.CheckoutRequestID,
    merchantRequestId:   data.MerchantRequestID,
    responseCode:        data.ResponseCode,
    responseDescription: data.ResponseDescription,
  };
}

async function queryStkStatus(checkoutRequestId) {
  const token     = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const password  = generateStkPassword(timestamp);

  const response = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: MPESA_CONFIG.shortCode,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    }
  );

  const data = await response.json();
  const code = data.ResultCode ?? data.errorCode;

  let status;
  if      (code === "0")    status = "completed";
  else if (code === "1032") status = "cancelled";
  else if (code === "1037") status = "pending";
  else                      status = "failed";

  return {
    success:    code === "0",
    status,
    resultCode: code,
    resultDesc: data.ResultDesc || data.errorMessage || "",
  };
}

function pollPaymentStatus(checkoutRequestId, callbacks) {
  const {
    onComplete  = () => {},
    onCancelled = () => {},
    onTimeout   = () => {},
    onError     = () => {},
  } = callbacks;

  const INTERVAL_MS  = 5000;
  const MAX_ATTEMPTS = 24;
  let   attempts     = 0;

  const interval = setInterval(async () => {
    attempts++;

    try {
      const result = await queryStkStatus(checkoutRequestId);

      if (result.status === "completed") {
        clearInterval(interval);
        onComplete(result);
      } else if (result.status === "cancelled") {
        clearInterval(interval);
        onCancelled();
      } else if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        onTimeout();
      }
    } catch (error) {
      clearInterval(interval);
      onError(error);
    }
  }, INTERVAL_MS);
}

async function releaseEscrowToLandlord(payoutDetails) {
  const { landlordPhone, amount, escrowRef, listingTitle, remarks = "KejaFinds deposit release" } = payoutDetails;

  const token = await getMpesaToken();
  const phone = landlordPhone.replace(/^\+/, "").replace(/^0/, "254");

  const response = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/b2c/v1/paymentrequest`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        InitiatorName:      MPESA_CONFIG.b2cInitiatorName,
        SecurityCredential: MPESA_CONFIG.b2cSecurityCred,
        CommandID:          "BusinessPayment",
        Amount:             Math.round(amount),
        PartyA:             MPESA_CONFIG.shortCode,
        PartyB:             phone,
        Remarks:            `${remarks} | ${escrowRef}`.slice(0, 100),
        QueueTimeOutURL:    MPESA_CONFIG.b2cTimeoutUrl,
        ResultURL:          MPESA_CONFIG.b2cResultUrl,
        Occasion:           listingTitle.slice(0, 100),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.ResponseCode !== "0") {
    return {
      success:             false,
      responseCode:        data.ResponseCode,
      responseDescription: data.ResponseDescription || "B2C payout failed",
    };
  }

  return {
    success:             true,
    conversationId:      data.ConversationID,
    originatorConvId:    data.OriginatorConversationID,
    responseCode:        data.ResponseCode,
    responseDescription: data.ResponseDescription,
  };
}

function handleStkCallback(req, res) {
  const callback = req.body?.Body?.stkCallback;

  if (!callback) {
    return res.status(400).json({ ResultCode: 1, ResultDesc: "Bad request" });
  }

  const { MerchantRequestID, CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

  if (ResultCode === 0) {
    const meta = CallbackMetadata?.Item || [];
    const get  = key => meta.find(i => i.Name === key)?.Value;

    const paymentRecord = {
      merchantRequestId:  MerchantRequestID,
      checkoutRequestId:  CheckoutRequestID,
      mpesaReceiptNumber: get("MpesaReceiptNumber"),
      amount:             get("Amount"),
      phoneNumber:        get("PhoneNumber"),
      transactionDate:    get("TransactionDate"),
      status:             "paid",
    };

    console.log("[KejaFinds] Deposit paid:", paymentRecord);
  }

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getMpesaToken,
    initiateStkPush,
    queryStkStatus,
    pollPaymentStatus,
    releaseEscrowToLandlord,
    handleStkCallback,
  };
}

// WhatsApp Cloud API
const WHATSAPP_CONFIG = {
  accessToken:   "YOUR_WHATSAPP_ACCESS_TOKEN",
  phoneNumberId: "YOUR_PHONE_NUMBER_ID",
  apiVersion:    "v19.0",
  baseUrl:       "https://graph.facebook.com",
};

async function whatsappSend(to, payload) {
  const url = `${WHATSAPP_CONFIG.baseUrl}/${WHATSAPP_CONFIG.apiVersion}`
            + `/${WHATSAPP_CONFIG.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                to.replace(/^\+/, ""),
    ...payload,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_CONFIG.accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "WhatsApp API error");
  }

  return data;
}

async function sendViewingRequest(landlordPhone, viewingDetails) {
  const { tenantName, tenantPhone, listingTitle, listingId, preferredDate } = viewingDetails;

  return whatsappSend(landlordPhone, {
    type: "text",
    text: {
      body:
        `*KejaFinds — New Viewing Request*\n\n` +
        `*Listing:* ${listingTitle}\n` +
        `*Listing ID:* ${listingId}\n\n` +
        `*Tenant:* ${tenantName}\n` +
        `*Phone:* +${tenantPhone}\n` +
        `*Preferred date:* ${preferredDate}\n\n` +
        `Reply directly to this number to confirm or suggest a different time.\n` +
        `*No viewing fees are charged through KejaFinds.*`,
      preview_url: false,
    },
  });
}

async function sendViewingConfirmation(tenantPhone, confirmationDetails) {
  const {
    tenantName, listingTitle, confirmedDate,
    confirmedTime, address, landlordName, landlordPhone,
  } = confirmationDetails;

  return whatsappSend(tenantPhone, {
    type: "text",
    text: {
      body:
        `*KejaFinds — Viewing Confirmed ✓*\n\n` +
        `Hi ${tenantName}, your viewing has been confirmed.\n\n` +
        `*Property:* ${listingTitle}\n` +
        `*Date:* ${confirmedDate}\n` +
        `*Time:* ${confirmedTime}\n` +
        `*Address:* ${address}\n\n` +
        `*Landlord:* ${landlordName}\n` +
        `*Direct contact:* +${landlordPhone}\n\n` +
        `Reminder: No viewing fee should be charged. If asked to pay, ` +
        `report it immediately via KejaFinds.`,
      preview_url: false,
    },
  });
}

async function sendDepositEscrowNotification(landlordPhone, escrowDetails) {
  const {
    landlordName, tenantName, listingTitle,
    depositAmount, moveInDate, escrowRef,
  } = escrowDetails;

  const formatted = depositAmount.toLocaleString("en-KE", {
    style: "currency", currency: "KES",
  });

  return whatsappSend(landlordPhone, {
    type: "text",
    text: {
      body:
        `*KejaFinds — Deposit Secured in Escrow*\n\n` +
        `Hi ${landlordName},\n\n` +
        `*${tenantName}* has paid a deposit of *${formatted}* ` +
        `for your listing:\n*${listingTitle}*\n\n` +
        `Funds are held securely in M-Pesa escrow.\n` +
        `They will be released to your M-Pesa number automatically ` +
        `once the tenant confirms move-in on *${moveInDate}*.\n\n` +
        `*Escrow reference:* ${escrowRef}\n\n` +
        `Questions? Contact KejaFinds support.`,
      preview_url: false,
    },
  });
}

async function sendEscrowReleaseAlert(recipientPhone, releaseDetails) {
  const {
    recipientName, role, listingTitle,
    depositAmount, escrowRef, releaseDate,
  } = releaseDetails;

  const formatted = depositAmount.toLocaleString("en-KE", {
    style: "currency", currency: "KES",
  });

  const landlordMsg =
    `*KejaFinds — Escrow Released ✓*\n\n` +
    `Hi ${recipientName},\n\n` +
    `Your tenant has confirmed move-in for *${listingTitle}*.\n` +
    `*${formatted}* has been released from escrow to your M-Pesa.\n\n` +
    `*Reference:* ${escrowRef}\n` +
    `*Date:* ${releaseDate}\n\n` +
    `Thank you for listing on KejaFinds.`;

  const tenantMsg =
    `*KejaFinds — Move-In Confirmed ✓*\n\n` +
    `Hi ${recipientName},\n\n` +
    `You have successfully moved into *${listingTitle}*.\n` +
    `Your deposit of *${formatted}* has been released to your landlord.\n\n` +
    `*Reference:* ${escrowRef}\n` +
    `*Date:* ${releaseDate}\n\n` +
    `Please leave a review for your landlord on KejaFinds.`;

  return whatsappSend(recipientPhone, {
    type: "text",
    text: {
      body:        role === "landlord" ? landlordMsg : tenantMsg,
      preview_url: false,
    },
  });
}

async function sendMaintenanceAlert(landlordPhone, requestDetails) {
  const {
    landlordName, tenantName, listingTitle,
    issueType, description, requestId, submittedAt,
  } = requestDetails;

  return whatsappSend(landlordPhone, {
    type: "text",
    text: {
      body:
        `*KejaFinds — Maintenance Request*\n\n` +
        `Hi ${landlordName},\n\n` +
        `*${tenantName}* has logged a maintenance request for:\n` +
        `*${listingTitle}*\n\n` +
        `*Issue type:* ${issueType}\n` +
        `*Description:* ${description}\n` +
        `*Submitted:* ${submittedAt}\n` +
        `*Request ID:* ${requestId}\n\n` +
        `Log in to KejaFinds to acknowledge and track this request.`,
      preview_url: false,
    },
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    sendViewingRequest,
    sendViewingConfirmation,
    sendDepositEscrowNotification,
    sendEscrowReleaseAlert,
    sendMaintenanceAlert,
  };
}

// Nominatim API
const NOMINATIM_CONFIG = {
  baseUrl:     "https://nominatim.openstreetmap.org",
  userAgent:   "KejaFinds/1.0 (contact@kejafinds.co.ke)",
  rateLimit:   1000,
};

let lastRequestTime = 0;
let debounceTimer   = null;

async function nominatimFetch(url) {
  const now     = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < NOMINATIM_CONFIG.rateLimit) {
    await new Promise(resolve =>
      setTimeout(resolve, NOMINATIM_CONFIG.rateLimit - elapsed)
    );
  }

  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent":      NOMINATIM_CONFIG.userAgent,
      "Accept-Language": "en",
    },
  });

  if (!response.ok) throw new Error(`Nominatim fetch failed: ${response.status}`);
  return response.json();
}

async function geocodeFromListingFields(listingFields) {
  const { street = "", estate = "", area = "", city = "Nairobi" } = listingFields;

  const parts = [street, estate, area, city, "Kenya"]
    .map(p => p.trim())
    .filter(Boolean);

  const query = parts.join(", ");

  if (!estate && !street) return null;

  const url = `${NOMINATIM_CONFIG.baseUrl}/search?` + new URLSearchParams({
    q:              query,
    format:         "json",
    addressdetails: 1,
    limit:          1,
    countrycodes:   "ke",
  });

  try {
    const data = await nominatimFetch(url);

    if (!data || data.length === 0) return null;

    const result = data[0];

    return {
      lat:            parseFloat(result.lat),
      lon:            parseFloat(result.lon),
      displayName:    result.display_name,
      suburb:         result.address?.suburb
                   || result.address?.neighbourhood
                   || estate,
      county:         result.address?.county   || null,
      postcode:       result.address?.postcode  || null,
      formattedQuery: query,
    };

  } catch (error) {
    console.error("[KejaFinds] geocodeFromListingFields failed:", error);
    return null;
  }
}

function autocompleteEstate(inputValue, onResults) {
  clearTimeout(debounceTimer);

  if (!inputValue || inputValue.trim().length < 3) {
    onResults([]);
    return;
  }

  debounceTimer = setTimeout(async () => {
    const url = `${NOMINATIM_CONFIG.baseUrl}/search?` + new URLSearchParams({
      q:              `${inputValue.trim()}, Nairobi, Kenya`,
      format:         "json",
      addressdetails: 1,
      limit:          5,
      countrycodes:   "ke",
    });

    try {
      const data = await nominatimFetch(url);

      const suggestions = data.map(item => ({
        label:      item.display_name,
        shortLabel: [
          item.address?.suburb,
          item.address?.neighbourhood,
          item.address?.county,
        ].filter(Boolean).join(", ") || item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));

      onResults(suggestions);

    } catch (error) {
      console.error("[KejaFinds] autocompleteEstate failed:", error);
      onResults([]);
    }
  }, 600);
}

function attachLocationAutofill() {
  const streetInput     = document.getElementById("input-street");
  const estateInput     = document.getElementById("input-estate");
  const areaInput       = document.getElementById("input-area");
  const cityInput       = document.getElementById("input-city");
  const suggestionsList = document.getElementById("estate-suggestions");
  const locationPreview = document.getElementById("location-preview");
  const hiddenLat       = document.getElementById("hidden-lat");
  const hiddenLon       = document.getElementById("hidden-lon");
  const hiddenAddress   = document.getElementById("hidden-display-address");

  estateInput.addEventListener("input", e => {
    autocompleteEstate(e.target.value, suggestions => {
      suggestionsList.innerHTML = "";

      suggestions.forEach(s => {
        const li = document.createElement("li");
        li.textContent  = s.shortLabel;
        li.style.cssText = "padding: 8px 12px; cursor: pointer; list-style: none;";

        li.addEventListener("click", () => {
          estateInput.value        = s.shortLabel.split(",")[0].trim();
          suggestionsList.innerHTML = "";
          hiddenLat.value          = s.lat;
          hiddenLon.value          = s.lon;
          hiddenAddress.value      = s.label;
          locationPreview.textContent = `📍 ${s.label}`;
        });

        suggestionsList.appendChild(li);
      });
    });
  });

  [streetInput, estateInput, areaInput, cityInput].forEach(input => {
    input.addEventListener("blur", async () => {
      const listingFields = {
        street: streetInput.value,
        estate: estateInput.value,
        area:   areaInput.value,
        city:   cityInput.value || "Nairobi",
      };

      if (!listingFields.estate && !listingFields.street) return;

      locationPreview.textContent = "Locating...";

      const result = await geocodeFromListingFields(listingFields);

      if (result) {
        hiddenLat.value             = result.lat;
        hiddenLon.value             = result.lon;
        hiddenAddress.value         = result.displayName;
        locationPreview.textContent = `📍 ${result.displayName}`;
      } else {
        locationPreview.textContent = "Could not find this location — try being more specific.";
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", attachLocationAutofill);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    geocodeFromListingFields,
    autocompleteEstate,
    attachLocationAutofill,
  };
}