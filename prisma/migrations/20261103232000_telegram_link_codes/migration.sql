CREATE TABLE "TelegramLinkCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLinkCode_codeHash_key" ON "TelegramLinkCode"("codeHash");
CREATE INDEX "TelegramLinkCode_userId_usedAt_idx" ON "TelegramLinkCode"("userId", "usedAt");
CREATE INDEX "TelegramLinkCode_expiresAt_idx" ON "TelegramLinkCode"("expiresAt");

ALTER TABLE "TelegramLinkCode"
ADD CONSTRAINT "TelegramLinkCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
