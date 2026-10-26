┌──────────────────────────────────────────────────────────────────┐
│                        USER LIFECYCLE                            │
└──────────────────────────────────────────────────────────────────┘

    ┌────────────────────┐
    │  1. SIGN UP        │  Google OAuth or email/password
    │  → JWT issued      │  User row created, tier = FREE
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  2. POST PRODUCT   │  iPhone 17, smartphones category
    │  + wanted[]        │  wants: audio, clothing
    │  + images[]        │  images: /uploads/abc.png
    └─────────┬──────────┘
              │  → FREE tier: max 1 active product
              │  → PRO tier: unlimited
              ▼
    ┌────────────────────┐
    │  3. GET /matches   │  Query runs every time user opens app
    │  → Scored results  │  Fresh match list (no cache, always current)
    │  → FREE: top 10    │  Rest hidden → "Upgrade to PRO" upsell
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  4. VIEW DETAIL    │  Click match → /products/:id
    │  → Product info    │  Public (shareable), no auth needed
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  5. SEND OFFER     │  POST /offers { offP, reqP, msg }
    │  → Atomic txn:     │  → Offer created (PENDING)
    │  → Product lock    │  → Both products → PENDING
    │  → 🔔 push notify  │  → Receiver's devices alerted
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  6. CHAT IN OFFER  │  POST /offers/:id/messages
    │  → Both parties    │  → Each message → 🔔 push
    │  → Negotiate       │  → Real-time-ish (polling / refresh)
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  7. ACCEPT         │  PATCH /offers/:id { action: "accept" }
    │  → Atomic txn:     │  → Offer ACCEPTED
    │  → Swap ownership  │  → Product A ownerId = B, B = A
    │  → 🔔 notify A     │  → Sender gets push: "Offer accepted 🎉"
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  8. MEET IN PERSON │  Offline — no app involvement
    │  → Exchange items  │  Manual/physical swap
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  9. COMPLETE       │  PATCH /offers/:id { action: "complete" }
    │  → Both mark done  │  → Offer COMPLETED, products SWAPPED
    │  → 🔔 notify other │
    └────────────────────┘