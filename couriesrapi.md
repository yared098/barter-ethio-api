# Courier Mobile API Reference

## Base Configuration

**Base URL**

```text
http://localhost:3000/api/v1
```

For production, replace the Base URL with the production API URL.

### Authentication

Authenticated requests must include:

```http
Authorization: Bearer <accessToken>
```

Example:

```http
Authorization: Bearer eyJ...
```

---

# 1. Authentication

## 1.1 Check Courier Phone

Check whether a phone number belongs to a courier and whether the courier can log in.

### Request

```http
POST /auth/courier/check-phone
```

**Authentication:** Not required

### Body

```json
{
  "phone": "251988888888"
}
```

### Response

```json
{
  "phone": "251988888888",
  "isCourier": true,
  "exists": true,
  "name": "Yades dr",
  "status": "APPROVED",
  "isActive": true,
  "phoneVerified": false,
  "vehicleType": "BICYCLE",
  "regionId": "cmulbfveg000511x1qnpqz8cu",
  "branchId": "cmulbgt9x000911x1vtbbfvmu",
  "canLogin": true
}
```

### Mobile behavior

Use `canLogin` to determine whether the courier can continue with login.

---

## 1.2 Request OTP

Send an OTP to the courier's phone.

### Request

```http
POST /auth/courier/otp/request
```

**Authentication:** Not required

### Body

```json
{
  "phone": "251988888888"
}
```

### Response

```json
{
  "message": "OTP sent"
}
```

---

## 1.3 Verify OTP

Verify the OTP and receive authentication tokens.

### Request

```http
POST /auth/courier/otp/verify
```

**Authentication:** Not required

### Body

```json
{
  "phone": "251988888888",
  "code": "123456"
}
```

### Response

```json
{
  "account": {
    "id": "cmulbjk4f000h11x1aefdselg",
    "phone": "251988888888",
    "name": "Yades dr",
    "email": "yades.dev@gmail.com",
    "regionId": "cmulbfveg000511x1qnpqz8cu",
    "branchId": "cmulbgt9x000911x1vtbbfvmu",
    "vehicleType": "BICYCLE",
    "status": "APPROVED",
    "rating": 5,
    "totalDeliveries": 0,
    "phoneVerified": true
  },
  "accountType": "COURIER",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

### Mobile storage

After successful verification:

1. Store `accessToken` securely.
2. Store `refreshToken` securely.
3. Store courier/account information locally if needed.
4. Navigate to the authenticated courier application.

Recommended secure storage:

```text
flutter_secure_storage
```

Do not store tokens in plain `SharedPreferences`.

---

## 1.4 Refresh Access Token

Use the refresh token when the access token expires.

### Request

```http
POST /auth/refresh
```

**Authentication:** Not required

### Body

```json
{
  "refreshToken": "eyJ..."
}
```

### Response

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

### Mobile behavior

When an authenticated API request returns `401 Unauthorized`:

1. Call `/auth/refresh`.
2. Save the new access token.
3. Save the new refresh token.
4. Retry the original request.
5. If refresh fails, clear authentication and redirect to login.

---

## 1.5 Logout

Logout the current session.

### Request

```http
POST /auth/logout
```

**Authentication:** Not required

### Body

```json
{
  "refreshToken": "eyJ..."
}
```

### Response

```json
{
  "message": "Logged out"
}
```

### Mobile behavior

After successful logout:

* Delete access token.
* Delete refresh token.
* Clear local courier session data.
* Navigate to login.

---

## 1.6 Logout All Devices

Logout all sessions/devices belonging to the courier.

### Request

```http
POST /auth/logout-all
```

**Authentication:** Required

### Headers

```http
Authorization: Bearer <accessToken>
```

### Body

None.

### Response

```json
{
  "message": "All sessions revoked"
}
```

---

# 2. Courier Profile

## 2.1 Get Current Courier

Retrieve the currently authenticated courier.

### Request

```http
GET /courier/me
```

**Authentication:** Required

### Response

```json
{
  "id": "cmulbjk4f000h11x1aefdselg",
  "phone": "251988888888",
  "name": "Yades dr",
  "email": "yades.dev@gmail.com",
  "regionId": "cmulbfveg000511x1qnpqz8cu",
  "branchId": "cmulbgt9x000911x1vtbbfvmu",
  "vehicleType": "BICYCLE",
  "vehiclePlate": null,
  "vehicleModel": null,
  "vehicleColor": null,
  "status": "APPROVED",
  "isActive": true,
  "phoneVerified": true,
  "rating": 5,
  "totalDeliveries": 0,
  "totalFailed": 0,
  "isOnline": false,
  "currentLat": null,
  "currentLng": null,
  "lastSeenAt": null,
  "createdAt": "2026-09-29T...",
  "region": {
    "id": "...",
    "name": "Addis Ababa",
    "code": "AA"
  },
  "branch": {
    "id": "...",
    "name": "Bole",
    "code": "BOL"
  }
}
```

---

## 2.2 Update Courier Profile

Update courier profile information.

### Request

```http
PATCH /courier/me
```

**Authentication:** Required

### Body

All fields are optional.

```json
{
  "name": "Yades D.",
  "email": "yades.new@example.com",
  "vehiclePlate": "AA-123456",
  "vehicleModel": "Hero Sprint",
  "vehicleColor": "Red"
}
```

### Response

```json
{
  "id": "cmulbjk4f000h11x1aefdselg",
  "name": "Yades D.",
  "email": "yades.new@example.com",
  "vehiclePlate": "AA-123456",
  "vehicleModel": "Hero Sprint",
  "vehicleColor": "Red",
  "updatedAt": "2026-09-29T..."
}
```

---

# 3. Online / Offline Status

The courier mobile application is responsible for maintaining the courier's online status and GPS location.

## 3.1 Go Online

Set courier status to online and send the initial GPS location.

### Request

```http
POST /courier/me/online
```

**Authentication:** Required

### Body

```json
{
  "lat": 9.0192,
  "lng": 38.7525
}
```

### Response

```json
{
  "isOnline": true,
  "lastSeenAt": "2026-09-29T...",
  "currentLat": 9.0192,
  "currentLng": 38.7525
}
```

### Mobile behavior

When the courier taps **Go Online**:

1. Request/check location permission.
2. Get current GPS position.
3. Call `/courier/me/online`.
4. Start periodic location updates.

---

## 3.2 Go Offline

Set courier status to offline.

### Request

```http
POST /courier/me/offline
```

**Authentication:** Required

### Body

None.

### Response

```json
{
  "isOnline": false
}
```

### Mobile behavior

When the courier goes offline:

* Stop GPS polling.
* Stop sending location updates.
* Call `/courier/me/offline`.

---

## 3.3 Update Courier Location

Send the courier's current GPS location.

### Request

```http
POST /courier/me/location
```

**Authentication:** Required

### Frequency

Call approximately every **15 seconds while the courier is online**.

### Body

```json
{
  "lat": 9.0192,
  "lng": 38.7525
}
```

### Response

```json
{
  "currentLat": 9.0192,
  "currentLng": 38.7525,
  "lastSeenAt": "2026-09-29T...",
  "lat": 9.0192,
  "lng": 38.7525
}
```

### Important

Do not continuously send location when the courier is offline.

Recommended flow:

```text
GO ONLINE
    ↓
Get GPS
    ↓
POST /courier/me/online
    ↓
Start 15-second timer
    ↓
Get GPS
    ↓
POST /courier/me/location
    ↓
Repeat
    ↓
GO OFFLINE
    ↓
Cancel timer
    ↓
POST /courier/me/offline
```

---

# 4. Jobs / Deliveries

## 4.1 Get Courier Jobs

Retrieve courier delivery jobs.

### Request

```http
GET /courier/jobs
```

**Authentication:** Required

### Query Parameters

| Parameter | Type   | Default  | Values                       |
| --------- | ------ | -------- | ---------------------------- |
| `status`  | string | `active` | `active`, `completed`, `all` |
| `page`    | number | `1`      | Positive integer             |
| `limit`   | number | `20`     | Positive integer             |

### Examples

Active jobs:

```http
GET /courier/jobs?status=active
```

Completed jobs:

```http
GET /courier/jobs?status=completed
```

All jobs:

```http
GET /courier/jobs?status=all
```

Pagination:

```http
GET /courier/jobs?status=active&page=1&limit=20
```

### Response

```json
{
  "data": [
    {
      "id": "cmu...",
      "trackingNumber": "ETH-2026-A1B2C3",
      "status": "ASSIGNED",

      "senderName": "Almaz Tesfaye",
      "senderPhone": "251911223344",
      "senderAddress": "Bole, Addis Ababa",
      "senderLat": 9.0192,
      "senderLng": 38.7525,

      "receiverName": "Kebede Alemu",
      "receiverPhone": "251955667788",
      "receiverAddress": "Adama, Oromia",
      "receiverLat": 8.54,
      "receiverLng": 39.27,

      "distanceKm": 98.3,
      "totalWeightKg": 2,

      "isFragile": false,
      "isRefrigerated": false,

      "courierEarning": 147,
      "paymentParty": "SENDER",
      "codAmount": 0,

      "items": [
        {
          "id": "i1",
          "type": "PARCEL",
          "description": "Books",
          "quantity": 1,
          "weightKg": 2
        }
      ],

      "assignedAt": "2026-09-29T...",
      "pickedUpAt": null,
      "deliveredAt": null,
      "estimatedArrival": "2026-09-29T..."
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

---

## 4.2 Get Job Details

Retrieve details for a specific delivery.

### Request

```http
GET /courier/jobs/:id
```

**Authentication:** Required

### Example

```http
GET /courier/jobs/cmu123456
```

### Response

The response contains the job information plus events and payments.

```json
{
  "id": "cmu...",
  "trackingNumber": "ETH-2026-A1B2C3",
  "status": "ASSIGNED",

  "senderName": "Almaz Tesfaye",
  "senderPhone": "251911223344",
  "senderAddress": "Bole, Addis Ababa",
  "senderLat": 9.0192,
  "senderLng": 38.7525,

  "receiverName": "Kebede Alemu",
  "receiverPhone": "251955667788",
  "receiverAddress": "Adama, Oromia",
  "receiverLat": 8.54,
  "receiverLng": 39.27,

  "distanceKm": 98.3,
  "totalWeightKg": 2,
  "isFragile": false,
  "isRefrigerated": false,

  "courierEarning": 147,
  "paymentParty": "SENDER",
  "codAmount": 0,

  "items": [],

  "assignedAt": "2026-09-29T...",
  "pickedUpAt": null,
  "deliveredAt": null,
  "estimatedArrival": "2026-09-29T...",

  "events": [
    {
      "id": "e1",
      "status": "ASSIGNED",
      "note": "Courier assigned",
      "createdAt": "2026-09-29T..."
    }
  ],

  "payments": []
}
```

---

## 4.3 Job Status Values

The mobile application should treat the `status` field as the source of truth.

Example:

```text
ASSIGNED
PICKED_UP
IN_TRANSIT
DELIVERED
FAILED
CANCELLED
```

The backend may introduce additional statuses in the future. The mobile application should handle unknown statuses gracefully.

---

# 5. Job Statistics

## 5.1 Get Job Statistics

Retrieve today's delivery statistics and all-time statistics.

### Request

```http
GET /courier/jobs/stats
```

**Authentication:** Required

### Response

```json
{
  "today": {
    "assigned": 5,
    "completed": 3,
    "inProgress": 2,
    "earnings": 441
  },
  "allTime": {
    "totalDeliveries": 128,
    "totalFailed": 3,
    "rating": 4.8
  }
}
```

### Dashboard usage

This endpoint can be used for the courier dashboard:

```text
Today's Deliveries
├── Assigned
├── Completed
├── In Progress
└── Earnings

All Time
├── Total Deliveries
├── Failed Deliveries
└── Rating
```

---

# 6. Earnings

## 6.1 Get Earnings

Retrieve courier earnings.

### Request

```http
GET /courier/earnings
```

**Authentication:** Required

### Query Parameters

| Parameter | Type   | Default | Values                                     |
| --------- | ------ | ------- | ------------------------------------------ |
| `status`  | string | —       | `PENDING`, `RELEASED`, `PAID`, `CANCELLED` |
| `page`    | number | `1`     | Positive integer                           |
| `limit`   | number | `20`    | Positive integer                           |

### Examples

All earnings:

```http
GET /courier/earnings
```

Released earnings:

```http
GET /courier/earnings?status=RELEASED
```

Pagination:

```http
GET /courier/earnings?status=PAID&page=1&limit=20
```

### Response

```json
{
  "data": [
    {
      "id": "e1",
      "courierId": "cmulbjk4f...",
      "orderId": "cmu...",
      "amount": 147,
      "currency": "ETB",
      "type": "DELIVERY",
      "status": "RELEASED",
      "description": null,
      "releasedAt": "2026-09-29T...",
      "createdAt": "2026-09-29T...",
      "order": {
        "trackingNumber": "ETH-2026-A1B2C3",
        "deliveryFee": 245
      }
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20,
  "pages": 2
}
```

---

## 6.2 Earnings Summary

Retrieve earnings totals.

### Request

```http
GET /courier/earnings/summary
```

**Authentication:** Required

### Response

```json
{
  "pending": 294,
  "released": 1470,
  "paid": 8420,
  "currency": "ETB"
}
```

### Dashboard usage

```text
Pending:   294 ETB
Released: 1470 ETB
Paid:     8420 ETB
```

---

# 7. Authentication Flow

The recommended mobile authentication flow is:

```text
┌─────────────────────┐
│ Enter Phone Number  │
└──────────┬──────────┘
           ↓
POST /auth/courier/check-phone
           ↓
      isCourier?
       /       \
     NO         YES
     ↓           ↓
 Show error   canLogin?
                ↓
        POST /auth/courier/otp/request
                ↓
          Enter OTP Code
                ↓
        POST /auth/courier/otp/verify
                ↓
        Receive Tokens
         /           \
 accessToken      refreshToken
      ↓                ↓
 Secure Storage   Secure Storage
      ↓
 Courier Dashboard
```

---

# 8. Token Refresh Flow

All authenticated API calls should use:

```http
Authorization: Bearer <accessToken>
```

If the server returns:

```http
401 Unauthorized
```

the mobile application should:

```text
API Request
    ↓
401?
    ↓ YES
POST /auth/refresh
    ↓
New accessToken
New refreshToken
    ↓
Save tokens
    ↓
Retry original request
```

If refresh fails:

```text
Clear tokens
    ↓
Clear local session
    ↓
Navigate to Login
```

---

# 9. Recommended Flutter API Structure

Recommended project structure:

```text
lib/
├── core/
│   ├── network/
│   │   ├── api_client.dart
│   │   ├── auth_interceptor.dart
│   │   └── api_exception.dart
│   │
│   └── storage/
│       └── secure_storage.dart
│
├── features/
│   └── courier/
│       ├── data/
│       │   ├── models/
│       │   │   ├── courier_model.dart
│       │   │   ├── job_model.dart
│       │   │   ├── earnings_model.dart
│       │   │   └── stats_model.dart
│       │   │
│       │   ├── datasources/
│       │   │   └── courier_api.dart
│       │   │
│       │   └── repositories/
│       │       └── courier_repository_impl.dart
│       │
│       ├── domain/
│       │   ├── entities/
│       │   └── repositories/
│       │
│       └── presentation/
│           ├── pages/
│           ├── widgets/
│           └── bloc/
```

---

# 10. API Endpoint Summary

| Method | Endpoint                    | Auth | Purpose                     |
| ------ | --------------------------- | ---- | --------------------------- |
| POST   | `/auth/courier/check-phone` | ❌    | Check courier phone         |
| POST   | `/auth/courier/otp/request` | ❌    | Send OTP                    |
| POST   | `/auth/courier/otp/verify`  | ❌    | Verify OTP + receive tokens |
| POST   | `/auth/refresh`             | ❌    | Refresh tokens              |
| POST   | `/auth/logout`              | ❌    | Logout current session      |
| POST   | `/auth/logout-all`          |     | Logout all sessions         |
| GET    | `/courier/me`               |     | Get courier profile         |
| PATCH  | `/courier/me`               |     | Update profile              |
| POST   | `/courier/me/online`        |     | Go online                   |
| POST   | `/courier/me/offline`       |     | Go offline                  |
| POST   | `/courier/me/location`      |     | Update GPS location         |
| GET    | `/courier/jobs`             |     | List jobs                   |
| GET    | `/courier/jobs/:id`         |     | Job details                 |
| GET    | `/courier/jobs/stats`       |     | Job statistics              |
| GET    | `/courier/earnings`         |     | Earnings list               |
| GET    | `/courier/earnings/summary` |     | Earnings summary            |

---

# 11. Important Mobile Implementation Notes

### Authentication

* Never hard-code access tokens.
* Store tokens securely.
* Automatically refresh expired access tokens.
* Clear tokens after logout.
* Handle `401` responses globally through an interceptor.

### GPS

* Request location permission before going online.
* Send the initial location when going online.
* Send location approximately every 15 seconds while online.
* Stop the location timer when going offline.
* Handle location permission denial gracefully.

### Pagination

Jobs and earnings support pagination.

Use:

```text
page
limit
total
pages
```

Example:

```json
{
  "page": 1,
  "limit": 20,
  "total": 25,
  "pages": 2
}
```

The mobile app should request the next page when the user reaches the end of the current list.

### Network errors

The mobile application should handle:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Validation Error
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

Show user-friendly messages rather than raw server errors.

### Offline support

The courier app should handle temporary network loss gracefully.

For example:

```text
Network unavailable
       ↓
Keep current UI state
       ↓
Retry when network returns
```

GPS updates should not crash the application if the API is temporarily unavailable.

---

# 12. Required Courier Screens

The API supports the following main mobile screens:

```text
Authentication
├── Phone Login
├── OTP Verification
└── Session Management

Dashboard
├── Online / Offline Toggle
├── Today's Statistics
├── Current Jobs
└── Earnings Summary

Jobs
├── Active Jobs
├── Completed Jobs
└── Job Details

Job Details
├── Sender Information
├── Receiver Information
├── Package Information
├── Delivery Location
├── Distance
├── Courier Earning
├── Delivery Status
└── Job Events

Earnings
├── Summary
├── Pending
├── Released
├── Paid
└── Earnings History

Profile
├── Personal Information
├── Vehicle Information
├── Region
├── Branch
├── Rating
└── Total Deliveries

Settings
└── Logout / Logout All
```

---

# 13. API Development Checklist

The mobile developer should implement:

* [ ] Courier phone check
* [ ] OTP request
* [ ] OTP verification
* [ ] Secure token storage
* [ ] Access-token interceptor
* [ ] Automatic token refresh
* [ ] Logout
* [ ] Logout all devices
* [ ] Get courier profile
* [ ] Update courier profile
* [ ] Go online
* [ ] Go offline
* [ ] GPS location updates every 15 seconds
* [ ] Active jobs
* [ ] Completed jobs
* [ ] All jobs
* [ ] Job pagination
* [ ] Job details
* [ ] Job events
* [ ] Job statistics
* [ ] Earnings list
* [ ] Earnings pagination
* [ ] Earnings summary
* [ ] Network error handling
* [ ] Authentication error handling
* [ ] Location permission handling
* [ ] Offline/network recovery

---

# 14. Backend Contract

The mobile application should treat the backend response as the source of truth.

In particular:

```text
Courier status
    ↓
status / isActive / canLogin

Online state
    ↓
isOnline

GPS
    ↓
currentLat / currentLng / lastSeenAt

Job state
    ↓
status

Authentication
    ↓
accessToken / refreshToken

Pagination
    ↓
page / limit / total / pages
```

The mobile application should not independently assume that a courier is online, authenticated, assigned to a job, or has completed a delivery without confirmation from the API.
