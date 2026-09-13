CREATE TABLE "repo_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"analysis_id" uuid,
	"file_path" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_chunks" ADD CONSTRAINT "repo_chunks_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_chunks" ADD CONSTRAINT "repo_chunks_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repo_chunks_repo_id_idx" ON "repo_chunks" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "repo_chunks_analysis_id_idx" ON "repo_chunks" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "repo_chunks_content_hash_idx" ON "repo_chunks" USING btree ("content_hash");