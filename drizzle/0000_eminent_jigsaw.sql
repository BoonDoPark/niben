CREATE TYPE "public"."conjugation_class" AS ENUM('godan', 'godan_iku', 'godan_aru', 'godan_uru', 'godan_honorific', 'ichidan', 'ichidan_kureru', 'suru', 'suru_special', 'suru_noun', 'kuru', 'adj_i', 'adj_i_ii', 'adj_na');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('jmdict', 'tatoeba', 'kanjium', 'wiktionary', 'llm', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."jlpt_level" AS ENUM('N5', 'N4', 'N3', 'N2', 'N1');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('ko', 'en', 'ja');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('noun', 'pronoun', 'verb_godan', 'verb_ichidan', 'verb_irregular', 'adj_i', 'adj_na', 'adverb', 'adnominal', 'conjunction', 'particle', 'auxiliary', 'interjection', 'prefix', 'suffix', 'counter', 'expression', 'other');--> statement-breakpoint
CREATE TABLE "example_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"example_id" integer NOT NULL,
	"lang" "language" NOT NULL,
	"text" text NOT NULL,
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"sense_id" integer NOT NULL,
	"order_no" integer DEFAULT 0 NOT NULL,
	"ja" text NOT NULL,
	"reading" text,
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sense_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"sense_id" integer NOT NULL,
	"lang" "language" NOT NULL,
	"glosses" text[] NOT NULL,
	"note" text,
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "senses" (
	"id" serial PRIMARY KEY NOT NULL,
	"word_id" integer NOT NULL,
	"order_no" integer DEFAULT 0 NOT NULL,
	"pos" "part_of_speech",
	"misc_tags" text[],
	"field_tags" text[],
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_ko" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_tags" (
	"word_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "word_tags_word_id_tag_id_pk" PRIMARY KEY("word_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"reading" text NOT NULL,
	"pos" "part_of_speech" DEFAULT 'other' NOT NULL,
	"conjugation_class" "conjugation_class",
	"accent" integer,
	"jlpt_level" "jlpt_level",
	"freq_rank" integer,
	"search_key" text,
	"jmdict_seq" integer,
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "example_translations" ADD CONSTRAINT "example_translations_example_id_examples_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."examples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_sense_id_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sense_translations" ADD CONSTRAINT "sense_translations_sense_id_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "senses" ADD CONSTRAINT "senses_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_tags" ADD CONSTRAINT "word_tags_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_tags" ADD CONSTRAINT "word_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "example_translations_example_id_lang_uq" ON "example_translations" USING btree ("example_id","lang");--> statement-breakpoint
CREATE INDEX "example_translations_lang_verified_idx" ON "example_translations" USING btree ("lang","verified");--> statement-breakpoint
CREATE INDEX "examples_sense_id_order_no_idx" ON "examples" USING btree ("sense_id","order_no");--> statement-breakpoint
CREATE INDEX "examples_verified_source_idx" ON "examples" USING btree ("verified","source");--> statement-breakpoint
CREATE UNIQUE INDEX "sense_translations_sense_id_lang_uq" ON "sense_translations" USING btree ("sense_id","lang");--> statement-breakpoint
CREATE INDEX "sense_translations_lang_verified_idx" ON "sense_translations" USING btree ("lang","verified");--> statement-breakpoint
CREATE INDEX "senses_word_id_order_no_idx" ON "senses" USING btree ("word_id","order_no");--> statement-breakpoint
CREATE INDEX "senses_verified_source_idx" ON "senses" USING btree ("verified","source");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_uq" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "word_tags_tag_id_idx" ON "word_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "words_lemma_reading_uq" ON "words" USING btree ("lemma","reading");--> statement-breakpoint
CREATE INDEX "words_jlpt_level_idx" ON "words" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "words_pos_idx" ON "words" USING btree ("pos");--> statement-breakpoint
CREATE INDEX "words_conjugation_class_idx" ON "words" USING btree ("conjugation_class");--> statement-breakpoint
CREATE INDEX "words_freq_rank_idx" ON "words" USING btree ("freq_rank");--> statement-breakpoint
CREATE INDEX "words_search_key_idx" ON "words" USING btree ("search_key");--> statement-breakpoint
CREATE INDEX "words_jmdict_seq_idx" ON "words" USING btree ("jmdict_seq");