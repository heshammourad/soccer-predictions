-- CreateEnum
CREATE TYPE "Certainty" AS ENUM ('CERTAIN', 'IMPOSSIBLE');

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN "certainty" "Certainty";
