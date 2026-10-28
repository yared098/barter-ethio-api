-- DropForeignKey
ALTER TABLE "BarterOffer" DROP CONSTRAINT "BarterOffer_requestedProductId_fkey";

-- AlterTable
ALTER TABLE "BarterOffer" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'BARTER',
ALTER COLUMN "requestedProductId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "BarterOffer_sourceType_sourceId_idx" ON "BarterOffer"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "BarterOffer" ADD CONSTRAINT "BarterOffer_requestedProductId_fkey" FOREIGN KEY ("requestedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
