-- CreateTable
CREATE TABLE "HelpFeedback" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpFeedback_slug_updatedAt_idx" ON "HelpFeedback"("slug", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpFeedback_userId_slug_key" ON "HelpFeedback"("userId", "slug");

-- AddForeignKey
ALTER TABLE "HelpFeedback" ADD CONSTRAINT "HelpFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who the user guide tells people to contact when they are stuck (editable in Administration > Policy).
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('helpContact', '"your Finance team"'::jsonb, now()) ON CONFLICT ("key") DO NOTHING;
