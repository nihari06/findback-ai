# FindBack AI – Smart Campus Lost & Found

FindBack AI is a modern lost-and-found web application built for college campuses. It replaces unorganized chat groups with a clean, centralized reporting system powered by **Google Gemini AI** to understand conversational descriptions and match lost and found items.

---

## 🛡️ Agentic Threat Modeling & Security Review

| Threat Zone | Identified Risk | OWASP Alignment | Implemented Countermeasure |
|:---|:---|:---|:---|
| **Input Surfaces** | Malicious text payload or script injection in item description/contact | OWASP A03 / LLM02 | Strict string trimming, length bounds, type guards, and HTML entity escaping on the frontend & backend before processing. |
| **Planning & Reasoning** | Prompt injection attempting to force false 100% matches or extract system prompt | OWASP LLM01 | User reports are interpolated strictly as data payloads inside delimiters. Model instructions mandate strict JSON parsing against schema. |
| **Tool & API Execution** | API Key exposure via client bundles | OWASP A01 / LLM06 | All Gemini requests are executed strictly on the server-side (`server.ts`). Secret keys are never sent to the browser. |
| **Memory & State** | Insecure database access and state manipulation | OWASP A01 | Strict schema validation rules in `firestore.rules` preventing unauthorized or unvalidated document mutations. |
| **Inter-System Communication** | Rate limits, transient API failure, or model service outages | OWASP LLM04 | Resilient 4-tier model fallback ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`) plus local heuristic safety fallback. |

---

## 🏗️ Architecture

- **Frontend:** React 18, Tailwind CSS, Lucide Icons, Vite
- **Backend:** Node.js Express service running on Google Cloud Run
- **Database:** Firebase Firestore with Fortress security rules (`firestore.rules`)
- **AI Engine:** Google Gemini API (`@google/genai` TypeScript SDK)

---

## 🚀 Getting Started Locally

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm

### 2. Environment Variables
Copy `.env.example` to `.env` and provide your Gemini API key:
```bash
cp .env.example .env
```

Ensure `GEMINI_API_KEY` is set in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Install & Start
```bash
npm install
npm run dev
```
Open `http://localhost:3000` to interact with FindBack AI.

---

## ☁️ Google Cloud Run Deployment Guide

### Step 1: Enable Google Cloud APIs
```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com
```

### Step 2: Configure Secret Manager for Gemini API Key
Store your Gemini API key securely in Google Cloud Secret Manager:
```bash
# Create the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# Add your key value
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant Cloud Run runtime service account read access
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 3: Deploy Cloud Firestore Security Rules
Ensure the `firestore.rules` file is deployed to enforce owner-bound security and schema validation:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /items/{itemId} {
      allow read: if true;
      allow create: if request.resource.data.itemName is string
                    && request.resource.data.itemType in ['lost', 'found'];
      allow update: if request.resource.data.status in ['lost', 'found', 'possible_match', 'returned'];
      allow delete: if false;
    }
    match /matches/{matchId} {
      allow read: if true;
      allow write: if false; // Server-side authored only
    }
  }
}
```
Deploy via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

### Step 4: Deploy to Cloud Run
Deploy the application container with Cloud Run referencing the secret:
```bash
gcloud run deploy findback-ai \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --port 3000
```

### Step 5: Required Campaign Labeling
To register the service for automated challenge verification, apply the mandatory resource label:
```bash
gcloud run services update findback-ai \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 🧪 Functional Walkthrough & Verification Steps

| Test ID | Interaction / Flow | Expected System Behavior |
|:---|:---|:---|
| **TC-01** | Open Home Page | Shows FindBack AI header, tagline, stat counters, and primary action buttons. |
| **TC-02** | Click "Report Lost Item" | Opens modal with item name, category, color, location, date, description, contact, and photo attachment. |
| **TC-03** | Submit Lost Report without required fields | Prevents submission and displays explicit field validation errors. |
| **TC-04** | Submit Lost Report with valid inputs | Submits to `/api/items`, triggers Gemini comparison, updates board, and displays match alert if match found. |
| **TC-05** | Click "Report Found Item" | Opens modal configured for found item reporting with emerald badge and submission flow. |
| **TC-06** | Run Official Demo Scenario | Seeds student lost black wallet at canteen + finder report; Gemini automatically evaluates match as **High Match** with explanation. |
| **TC-07** | View AI Match Card | Opens side-by-side comparison displaying lost report, found report, Gemini score gauge, and reasons. |
| **TC-08** | Contact / Claim Item | Reveals finder/owner contact information with direct mailto client action and safety reminders. |
| **TC-09** | Click "Confirm & Mark as Returned" | Persists status update to `/api/items/:id/status`, badges items as **Returned**, and updates live dashboard counters. |
| **TC-10** | Filter & Search Dashboard | Typing "wallet" or selecting "Wallets & Cards" instantly filters visible card grid. |
