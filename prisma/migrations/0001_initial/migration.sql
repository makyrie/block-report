-- CreateTable
CREATE TABLE "libraries" (
    "objectid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "libraries_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "rec_centers" (
    "objectid" INTEGER NOT NULL,
    "rec_bldg" TEXT,
    "park_name" TEXT,
    "fac_nm_id" TEXT,
    "address" TEXT,
    "zip" TEXT,
    "sq_ft" DOUBLE PRECISION,
    "year_built" INTEGER,
    "serv_dist" TEXT,
    "cd" INTEGER,
    "neighborhd" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "rec_centers_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "transit_stops" (
    "objectid" INTEGER NOT NULL,
    "stop_uid" TEXT,
    "stop_id" TEXT,
    "stop_code" TEXT,
    "stop_name" TEXT,
    "stop_lat" DOUBLE PRECISION,
    "stop_lon" DOUBLE PRECISION,
    "stop_agncy" TEXT,
    "wheelchair" INTEGER,
    "intersec" TEXT,
    "stop_place" TEXT,
    "parent_sta" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "transit_stops_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "requests_311" (
    "service_request_id" TEXT NOT NULL,
    "date_requested" TIMESTAMP(3),
    "case_age_days" INTEGER,
    "service_name" TEXT,
    "service_name_detail" TEXT,
    "date_closed" TIMESTAMP(3),
    "status" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "street_address" TEXT,
    "zipcode" TEXT,
    "council_district" TEXT,
    "comm_plan_code" TEXT,
    "comm_plan_name" TEXT,
    "case_origin" TEXT,
    "public_description" TEXT,

    CONSTRAINT "requests_311_pkey" PRIMARY KEY ("service_request_id")
);

-- CreateTable
CREATE TABLE "census_language" (
    "tract" TEXT NOT NULL,
    "total_pop_5plus" INTEGER,
    "english_only" INTEGER,
    "spanish" INTEGER,
    "french_haitian_cajun" INTEGER,
    "german_west_germanic" INTEGER,
    "russian_polish_slavic" INTEGER,
    "korean" INTEGER,
    "chinese" INTEGER,
    "vietnamese" INTEGER,
    "tagalog" INTEGER,
    "arabic" INTEGER,
    "other_unspecified" INTEGER,
    "community" TEXT,

    CONSTRAINT "census_language_pkey" PRIMARY KEY ("tract")
);

-- CreateTable
CREATE TABLE "report_cache" (
    "id" SERIAL NOT NULL,
    "community" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_311_comm_plan" ON "requests_311"("comm_plan_name");

-- CreateIndex
CREATE INDEX "idx_311_date" ON "requests_311"("date_requested");

-- CreateIndex
CREATE INDEX "idx_census_community" ON "census_language"("community");

-- CreateIndex
CREATE UNIQUE INDEX "report_cache_community_language_key" ON "report_cache"("community", "language");

-- CreateIndex
CREATE INDEX "idx_report_cache_created_at" ON "report_cache"("created_at");
