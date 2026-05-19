# RooME — Dorm Finder Web Application

A full-stack web application that helps students find dormitories near PUP Main Campus. Owners can list and manage their properties. Students can browse listings on an interactive map and contact owners via real-time chat.

---

## Project Structure

```
STS-web/
├── package.json              # Root scripts — delegates to backend
├── frontend/                 # Static HTML/CSS/JS served by Express
│   ├── index.html            # Landing page
│   ├── map.html              # Interactive dorm map
│   ├── signin.html           # Sign in / Register
│   ├── dashboard-owner.html  # Owner dashboard
│   ├── chat.html             # Real-time messaging
│   ├── style.css             # Global design system
│   ├── dashboard.css         # Dashboard and chat styles
│   ├── api.js                # Shared API utilities and ChatClient class
│   ├── map.js                # Leaflet map logic
│   └── scrpt.js              # Home page script
└── backend/
    ├── server.js             # Express entry point
    ├── package.json
    ├── routes/
    │   ├── auth.js           # Register, login, /me
    │   ├── dorms.js          # Dorm CRUD + filtering
    │   └── messages.js       # Message history and conversations
    ├── middleware/
    │   └── authenticate.js   # JWT verification and role guard
    ├── chat/
    │   ├── tcp-server.js     # Raw TCP chat server (port 4001)
    │   └── ws-gateway.js     # WebSocket-to-TCP bridge (port 3000/ws)
    └── db/
        └── database.js       # SQLite schema and seed data
```

---

## Getting Started

**Prerequisites:** Node.js v18 or later.

```bash
# Install backend dependencies
cd backend
npm install
cd ..

# Start the development server from the project root
Ensure you're at "\STS-web" and it should work
npm run dev
```

The server runs at `http://localhost:3000`.

**Demo accounts (seeded on first run):**

| Role    | Email               | Password    |
|---------|---------------------|-------------|
| Student | student@roome.ph    | password123 |
| Owner   | owner@roome.ph      | password123 |

---

## Frontend

### Pages

| Page                   | File                     | Access    |
|------------------------|--------------------------|-----------|
| Landing / Home         | `index.html`             | Public    |
| Dorm Map               | `map.html`               | Public    |
| Sign In / Register     | `signin.html`            | Public    |
| Owner Dashboard        | `dashboard-owner.html`   | Owner     |
| Chat                   | `chat.html`              | Any user  |

### User Flows

**Student**

1. Opens the home page and clicks "Search Dorms" or "Map" in the navigation.
2. The map page loads all dorm listings from the API and displays them as markers on OpenStreetMap.
3. Filters (price range, amenities, max distance) can be applied via the sidebar. Results update in real time.
4. Clicking a sidebar card pans the map to that dorm's marker.
5. Clicking "Contact Owner" on any card redirects to the chat page, pre-loaded with that owner and dorm context.
6. On the chat page the student sends messages via WebSocket. Message history is loaded from the REST API on open.

**Owner**

1. Signs in and selects the "Owner" role. Redirected to the owner dashboard.
2. The "My Listings" tab shows all dorms they have submitted with edit, delete, and status toggle actions.
3. The "Add Dorm" tab presents a form with an embedded Leaflet map picker. Clicking the map drops a pin and auto-fills latitude, longitude, and optionally the address field via Nominatim reverse geocoding. The marker is also draggable.
4. On save, the new listing is posted to the API and appears immediately on the public map.
5. The "Messages" tab lists all student inquiries grouped by conversation.

### Shared Utilities (`api.js`)

- `apiFetch(path, options)` — Authenticated fetch wrapper that injects the JWT from `localStorage`.
- `getUser()` / `saveAuth()` / `logout()` — Auth state helpers.
- `requireAuth(role)` — Redirects to sign-in if no token is present, or to the correct dashboard if the role does not match.
- `updateNavbar()` — Replaces the "Sign In" button with a dashboard link when a user is logged in.
- `ChatClient` — WebSocket client class with automatic reconnection, auth handshake, and typing indicator support.

---

## Backend

### Technology

- **Runtime:** Node.js
- **Framework:** Express 5
- **Database:** PostgreSQL via Supabase
- **Auth:** JSON Web Tokens (`jsonwebtoken`) + bcrypt password hashing
- **Real-time:** Raw TCP chat server (`node:net`) bridged to browser via WebSocket (`ws`)

### REST API

All routes are prefixed with `/api`.

#### Auth — `/api/auth`

| Method | Route      | Auth     | Description                          |
|--------|------------|----------|--------------------------------------|
| POST   | /register  | None     | Create account with role             |
| POST   | /login     | None     | Authenticate and receive JWT         |
| GET    | /me        | Required | Return the authenticated user record |

#### Dorms — `/api/dorms`

| Method | Route          | Auth         | Description                          |
|--------|----------------|--------------|--------------------------------------|
| GET    | /              | None         | List all dorms with optional filters |
| GET    | /:id           | None         | Get a single dorm                    |
| POST   | /              | Owner        | Create a listing                     |
| PUT    | /:id           | Owner (own)  | Update a listing                     |
| DELETE | /:id           | Owner (own)  | Delete a listing                     |
| GET    | /owner/mine    | Owner        | List the owner's own dorms           |

**Supported query filters for `GET /api/dorms`:**

- `minPrice`, `maxPrice` — price range in PHP
- `amenities` — comma-separated list, e.g. `WiFi,AC`
- `status` — `available` or `full`
- `lat`, `lng`, `maxDistance` — filter by distance (km) from a coordinate using the Haversine formula

#### Messages — `/api/messages`

| Method | Route             | Auth     | Description                                      |
|--------|-------------------|----------|--------------------------------------------------|
| GET    | /conversations    | Required | List all conversations for the current user      |
| GET    | /:userId          | Required | Message history with a specific user             |
| POST   | /                 | Required | Send a message (REST fallback if WebSocket fails)|

### Database Schema

```
users     — id, name, email, password (hashed), role, avatar, created_at
dorms     — id, owner_id, name, description, price, lat, lng, status, amenities (JSON), image_url, address, created_at
messages  — id, dorm_id, sender_id, receiver_id, text, read, created_at
```

### Real-time Chat Architecture

Browsers cannot open raw TCP sockets, so a two-layer approach is used:

```
Browser
  |
  | WebSocket (ws://localhost:3000/ws)
  v
WS Gateway (ws-gateway.js)       <-- one TCP connection per browser client
  |
  | TCP (localhost:4001)
  v
TCP Chat Server (tcp-server.js)  <-- manages all connected users in memory
  |
  | Reads / writes
  v
PostgreSQL (messages table)      <-- persists all messages
```

**Message flow:**

1. Browser connects to the WS gateway and sends `{ type: "auth", token: "<JWT>" }`.
2. The gateway opens a corresponding TCP socket to the chat server and forwards the auth message.
3. The TCP server verifies the JWT and registers the user's socket in a `Map<userId, socket>`.
4. On any `{ type: "message", to, text, dormId }` event, the server persists the message to PostgreSQL and forwards it to the recipient's TCP socket if they are online.
5. When a user connects, unread messages are delivered immediately from the database.
6. The WS gateway translates all TCP responses back to WebSocket frames for the browser.

---

## Deployment

The application is deployed across multiple cloud platforms:

- **Frontend (Vercel):** Hosted at https://roome-navy.vercel.app/, connected to the `frontend` directory of the https://github.com/inocule/STSweb repository.
- **Backend (Render):** Hosted as a web service on Render, connected to the `backend` directory of the same repository.
- **Database (Supabase):** PostgreSQL database hosted on Supabase.

### Environment Variables

The Render backend requires the following environment variables to be manually set up:
- `DATABASE_URL`: Connection string to the Supabase database using the IPv4 session pooler.
- `FRONTEND_URL`: URL of the deployed Vercel frontend.
- `JWT_SECRET`: Secret key for signing JSON Web Tokens.
- `NODE_ENV`: Set to `production`.

---

## Design System

- **Primary color:** `#800020` (deep crimson)
- **Background:** `#f4f5f7`
- **Font:** Inter (Google Fonts)
- **Map tiles:** OpenStreetMap via Leaflet 1.9.4
- **Reverse geocoding:** Nominatim (OpenStreetMap) — used in the owner dorm picker to auto-fill the address field