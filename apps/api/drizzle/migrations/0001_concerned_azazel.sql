CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_chunk_source" ON "content_chunks" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chunk_embedding" ON "content_chunks" USING hnsw ("embedding" vector_cosine_ops);