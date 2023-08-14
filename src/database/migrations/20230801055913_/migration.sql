-- AlterTable
ALTER TABLE "bookmarks" ADD COLUMN     "favorite" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "bookmark_id" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_bookmark_id_fkey" FOREIGN KEY ("bookmark_id") REFERENCES "bookmarks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
