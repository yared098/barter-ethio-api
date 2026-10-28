-- DropForeignKey
ALTER TABLE "BarterOffer" DROP CONSTRAINT "BarterOffer_offeredProductId_fkey";

-- AlterTable
ALTER TABLE "BarterOffer" ALTER COLUMN "offeredProductId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BarterOffer" ADD CONSTRAINT "BarterOffer_offeredProductId_fkey" FOREIGN KEY ("offeredProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
