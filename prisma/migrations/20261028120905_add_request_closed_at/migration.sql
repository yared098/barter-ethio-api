-- CreateEnum
CREATE TYPE "BidType" AS ENUM ('CASH', 'BARTER', 'EITHER');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('BUY', 'BARTER', 'EITHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'CLOSED', 'FULFILLED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "BidListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "BidType" NOT NULL DEFAULT 'CASH',
    "startingBid" DOUBLE PRECISION,
    "minIncrement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyNowPrice" DOUBLE PRECISION,
    "reservePrice" DOUBLE PRECISION,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "acceptedBidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "offeredProductId" TEXT,
    "message" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "specifications" JSONB,
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "type" "RequestType" NOT NULL DEFAULT 'BUY',
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "categoryId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "productId" TEXT,
    "message" TEXT NOT NULL,
    "offeredPrice" DOUBLE PRECISION,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "RequestResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BidListing_productId_key" ON "BidListing"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BidListing_acceptedBidId_key" ON "BidListing"("acceptedBidId");

-- CreateIndex
CREATE INDEX "BidListing_status_endsAt_idx" ON "BidListing"("status", "endsAt");

-- CreateIndex
CREATE INDEX "BidListing_ownerId_status_idx" ON "BidListing"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Bid_listingId_status_createdAt_idx" ON "Bid"("listingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Bid_bidderId_status_idx" ON "Bid"("bidderId", "status");

-- CreateIndex
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_authorId_status_idx" ON "Request"("authorId", "status");

-- CreateIndex
CREATE INDEX "Request_categoryId_status_idx" ON "Request"("categoryId", "status");

-- CreateIndex
CREATE INDEX "RequestResponse_requestId_status_idx" ON "RequestResponse"("requestId", "status");

-- CreateIndex
CREATE INDEX "RequestResponse_responderId_idx" ON "RequestResponse"("responderId");

-- AddForeignKey
ALTER TABLE "BidListing" ADD CONSTRAINT "BidListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidListing" ADD CONSTRAINT "BidListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidListing" ADD CONSTRAINT "BidListing_acceptedBidId_fkey" FOREIGN KEY ("acceptedBidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "BidListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_offeredProductId_fkey" FOREIGN KEY ("offeredProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestResponse" ADD CONSTRAINT "RequestResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestResponse" ADD CONSTRAINT "RequestResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestResponse" ADD CONSTRAINT "RequestResponse_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestResponse" ADD CONSTRAINT "RequestResponse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
