-- AlterTable
ALTER TABLE "Match" ADD COLUMN "resultSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataSync" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSync_pkey" PRIMARY KEY ("id")
);
