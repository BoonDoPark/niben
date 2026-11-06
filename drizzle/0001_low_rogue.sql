ALTER TABLE "words" ADD COLUMN "usage_rank" integer;--> statement-breakpoint
CREATE INDEX "words_usage_rank_idx" ON "words" USING btree ("usage_rank");