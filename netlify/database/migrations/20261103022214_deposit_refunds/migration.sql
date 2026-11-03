-- AlterTable
ALTER TABLE "DepositRequest" ADD COLUMN     "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
