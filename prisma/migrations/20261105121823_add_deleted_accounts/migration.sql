-- CreateTable
CREATE TABLE "deleted_accounts" (
    "auth_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_accounts_pkey" PRIMARY KEY ("auth_user_id")
);
