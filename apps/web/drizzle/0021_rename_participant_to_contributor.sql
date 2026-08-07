-- "Participant" and "contributor" were the same concept under two names —
-- rename the roster table/columns to match what they actually are.
ALTER TABLE "collection_participants" RENAME TO "collection_contributors";--> statement-breakpoint

ALTER TABLE "collection_contributors" RENAME CONSTRAINT "collection_participants_pkey" TO "collection_contributors_pkey";--> statement-breakpoint
ALTER TABLE "collection_contributors" RENAME CONSTRAINT "collection_participants_collection_id_collections_id_fk" TO "collection_contributors_collection_id_collections_id_fk";--> statement-breakpoint
ALTER TABLE "collection_contributors" RENAME CONSTRAINT "collection_participants_user_id_users_id_fk" TO "collection_contributors_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "collection_contributors" RENAME CONSTRAINT "collection_participants_linked_user_id_users_id_fk" TO "collection_contributors_linked_user_id_users_id_fk";--> statement-breakpoint

ALTER INDEX "collection_participants_collection_idx" RENAME TO "collection_contributors_collection_idx";--> statement-breakpoint
ALTER INDEX "collection_participants_user_idx" RENAME TO "collection_contributors_user_idx";--> statement-breakpoint

ALTER POLICY "collection_participants_select_own" ON "collection_contributors" RENAME TO "collection_contributors_select_own";--> statement-breakpoint
ALTER POLICY "collection_participants_insert_own" ON "collection_contributors" RENAME TO "collection_contributors_insert_own";--> statement-breakpoint
ALTER POLICY "collection_participants_update_own" ON "collection_contributors" RENAME TO "collection_contributors_update_own";--> statement-breakpoint
ALTER POLICY "collection_participants_delete_own" ON "collection_contributors" RENAME TO "collection_contributors_delete_own";--> statement-breakpoint

ALTER TABLE "collection_contributions" RENAME COLUMN "participant_id" TO "contributor_id";--> statement-breakpoint
ALTER TABLE "collection_contributions" RENAME CONSTRAINT "collection_contributions_participant_id_collection_participants" TO "collection_contributions_contributor_id_fk";--> statement-breakpoint
ALTER INDEX "collection_contrib_participant_idx" RENAME TO "collection_contrib_contributor_idx";--> statement-breakpoint

ALTER TABLE "collection_expenses" RENAME COLUMN "paid_by_participant_id" TO "paid_by_contributor_id";--> statement-breakpoint
ALTER TABLE "collection_expenses" RENAME CONSTRAINT "collection_expenses_paid_by_participant_id_collection_participa" TO "collection_expenses_paid_by_contributor_id_fk";
