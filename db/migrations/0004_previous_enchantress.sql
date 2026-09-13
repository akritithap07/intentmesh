CREATE TABLE "documentation_prs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"documentation_version_id" uuid NOT NULL,
	"branch_name" text NOT NULL,
	"pull_request_number" integer NOT NULL,
	"pull_request_url" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doc_prs_repo_version_unique" UNIQUE("repo_id","documentation_version_id")
);
--> statement-breakpoint
CREATE TABLE "documentation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"document_type" text DEFAULT 'README.md' NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"verification_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentation_prs" ADD CONSTRAINT "documentation_prs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentation_prs" ADD CONSTRAINT "documentation_prs_documentation_version_id_documentation_versions_id_fk" FOREIGN KEY ("documentation_version_id") REFERENCES "public"."documentation_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentation_versions" ADD CONSTRAINT "documentation_versions_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentation_versions" ADD CONSTRAINT "documentation_versions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_prs_repo_id_idx" ON "documentation_prs" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "doc_versions_repo_id_idx" ON "documentation_versions" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "doc_versions_analysis_id_idx" ON "documentation_versions" USING btree ("analysis_id");