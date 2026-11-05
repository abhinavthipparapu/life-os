-- DropForeignKey
ALTER TABLE "template_installs" DROP CONSTRAINT "template_installs_version_id_fkey";

-- AlterTable
ALTER TABLE "template_installs" ALTER COLUMN "version_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "template_installs" ADD CONSTRAINT "template_installs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
