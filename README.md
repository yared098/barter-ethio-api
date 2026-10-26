# barter-ethio-api
# Barter API

Backend for **Barter Ethio** — a peer-to-peer barter exchange platform. Users post items they own, declare what they want in return, and the system surfaces ranked matches. When both parties agree, ownership of the two products swaps atomically in the database.

**Stack:** NestJS 10 · Prisma 5 · PostgreSQL 16 · JWT + Google OAuth · Firebase-ready push notifications

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [API Reference](#api-reference)
- [Barter Lifecycle](#barter-lifecycle)
- [Tier System (FREE / PRO)](#tier-system-free--pro)
- [Notifications](#notifications)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

Barter Ethio replaces cash transactions with **item-for-item swaps**. Instead of selling an iPhone to buy a Samsung, users trade directly:

1. **Alice** posts her iPhone 17 and says she wants *Audio* or *Clothing* in return
2. **Bob** posts his Samsung S24 Ultra and says he wants *Smartphones*
3. Both see each other in their **matches feed**
4. Alice sends Bob an offer; Bob accepts
5. Ownership swaps in a single database transaction
6. Both users mark the swap as *completed* once they meet in person

The platform is **free** with a **PRO tier** that unlocks unlimited postings and full match visibility.

---

## Features

### Authentication
- ✅ Google OAuth login (ID token verification)
- ✅ Email + password login (fallback / testing)
- ✅ Short-lived JWT access tokens (15m) + rotating refresh tokens (30d)
- ✅ Refresh token rotation & revocation
- ✅ Logout (revoke all sessions)
- ✅ Role-based access control (`USER`, `ADMIN`)

### Products
- ✅ Create product listings with images
- ✅ **Multiple wanted categories per product** ("I'll trade for Audio OR Clothing")
- ✅ Free-text keyword hints ("Samsung S24 Ultra", "Nike size 42")
- ✅ Optional value range (`minValue` / `maxValue`)
- ✅ Browse with filters: category, wanted category, search, status, mine
- ✅ Owner-only update/delete (only while `AVAILABLE`)

### Matching
- ✅ Bidirectional scoring (do they also want what I have?)
- ✅ Value proximity (closer = higher score)
- ✅ Keyword match bonus ("Samsung" appears in title)
- ✅ Human-readable reasons per match ("They also want what you have")
- ✅ **Tier-gated visibility** — FREE users see top 10, PRO sees all

### Barter Offers
- ✅ Full state machine: `PENDING → ACCEPTED → COMPLETED` (+ `DECLINED`, `CANCELLED`)
- ✅ Atomic ownership swap inside a database transaction
- ✅ Product locking (`PENDING`) while offer is open
- ✅ In-offer chat (messages between the two parties)
- ✅ Notifications at every state transition

### Monetization
- ✅ FREE tier: 1 active product, 10 visible matches
- ✅ PRO tier: unlimited products, unlimited matches
- ✅ `getEffectiveTier()` helper (handles expired `proExpiresAt`)
- ✅ `Subscription` model ready for payment-provider integration

### Uploads & Notifications
- ✅ Local file storage under `/uploads/` (5MB limit, jpg/png/webp/gif)
- ✅ Device token registration endpoint (Firebase Cloud Messaging ready)
- ✅ `NotificationsService` with typed helpers — swap the logger for `firebase-admin` in one place

---

## Architecture
