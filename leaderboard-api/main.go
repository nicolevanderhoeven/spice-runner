package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gorilla/mux/otelmux"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	serviceName    = "spice-runner-leaderboard-api"
	serviceVersion = "1.0.0"

	// Cache keys
	cacheKeyTopScores  = "leaderboard:top:100"
	cacheKeyPlayerRank = "leaderboard:player:%s:rank"

	// Cache TTL
	cacheTTL = 5 * time.Minute

	// Anti-cheat limits
	maxRealisticScore          = 100000
	minScoreSubmissionInterval = 10 * time.Second
)

var (
	tracer trace.Tracer
	meter  metric.Meter

	// Custom metrics
	scoreSubmissionsTotal      metric.Int64Counter
	scoreSubmissionErrors      metric.Int64Counter
	cacheHitTotal              metric.Int64Counter
	cacheMissTotal             metric.Int64Counter
	scoreValidationDuration    metric.Float64Histogram
	dbQueryDuration            metric.Float64Histogram
	redisOpDuration            metric.Float64Histogram
	httpServerRequestDuration  metric.Float64Histogram
	httpServerRequestsTotal    metric.Int64Counter
)

type App struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

type ScoreSubmission struct {
	PlayerName string `json:"playerName"`
	Score      int    `json:"score"`
	SessionID  string `json:"sessionId"`
}

type ScoreResponse struct {
	ID         int       `json:"id"`
	PlayerName string    `json:"playerName"`
	Score      int       `json:"score"`
	Rank       int       `json:"rank"`
	CreatedAt  time.Time `json:"createdAt"`
}

type LeaderboardEntry struct {
	Rank       int       `json:"rank"`
	PlayerName string    `json:"playerName"`
	Score      int       `json:"score"`
	CreatedAt  time.Time `json:"createdAt"`
}

type PlayerStats struct {
	PlayerName   string             `json:"playerName"`
	BestScore    int                `json:"bestScore"`
	CurrentRank  int                `json:"currentRank"`
	TotalGames   int                `json:"totalGames"`
	RecentScores []LeaderboardEntry `json:"recentScores"`
}

func main() {
	ctx := context.Background()

	// Initialize OpenTelemetry
	shutdown, err := initOTel(ctx)
	if err != nil {
		log.Fatalf("Failed to initialize OpenTelemetry: %v", err)
	}
	defer shutdown(ctx)

	// Initialize tracer and meter
	tracer = otel.Tracer(serviceName)
	meter = otel.Meter(serviceName)

	// Initialize custom metrics
	if err := initMetrics(); err != nil {
		log.Fatalf("Failed to initialize metrics: %v", err)
	}

	// Connect to PostgreSQL
	dbPool, err := connectDB(ctx)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer dbPool.Close()

	// Initialize database schema
	if err := initDB(ctx, dbPool); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Connect to Redis
	redisClient := connectRedis()
	defer redisClient.Close()

	// Create app
	app := &App{
		db:    dbPool,
		redis: redisClient,
	}

	// Setup HTTP server with OpenTelemetry instrumentation
	router := mux.NewRouter()
	router.Use(otelmux.Middleware(serviceName))
	router.Use(httpMetricsMiddleware)
	router.Use(corsMiddleware)

	// Create a subrouter for /spice/leaderboard prefix (for GCP ingress)
	apiRouter := router.PathPrefix("/spice/leaderboard").Subrouter()
	apiRouter.HandleFunc("/api/scores", app.submitScoreHandler).Methods("POST")
	apiRouter.HandleFunc("/api/leaderboard/top", app.getTopScoresHandler).Methods("GET")
	apiRouter.HandleFunc("/api/leaderboard/player/{name}", app.getPlayerStatsHandler).Methods("GET")
	apiRouter.HandleFunc("/api/health", app.healthHandler).Methods("GET")
	
	// Also keep direct paths for local development and direct access
	router.HandleFunc("/health", app.healthHandler).Methods("GET")
	router.HandleFunc("/api/scores", app.submitScoreHandler).Methods("POST")
	router.HandleFunc("/api/leaderboard/top", app.getTopScoresHandler).Methods("GET")
	router.HandleFunc("/api/leaderboard/player/{name}", app.getPlayerStatsHandler).Methods("GET")
	router.Handle("/metrics", promhttp.Handler()).Methods("GET")

	port := getEnv("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		log.Printf("🚀 Leaderboard API server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("✅ Server exited")
}

func initOTel(ctx context.Context) (func(context.Context) error, error) {
	// Create resource
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Setup trace exporter to Tempo via OTLP
	traceExporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "tempo.observability.svc.cluster.local:4317")),
		otlptracegrpc.WithTLSCredentials(insecure.NewCredentials()),
		otlptracegrpc.WithDialOption(grpc.WithBlock()),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Setup trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	// Setup Prometheus metrics exporter
	metricExporter, err := prometheus.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create Prometheus exporter: %w", err)
	}

	// Setup metric provider
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(metricExporter),
		sdkmetric.WithResource(res),
	)
	otel.SetMeterProvider(mp)

	log.Println("✅ OpenTelemetry initialized")

	return func(ctx context.Context) error {
		if err := tp.Shutdown(ctx); err != nil {
			return err
		}
		if err := mp.Shutdown(ctx); err != nil {
			return err
		}
		return nil
	}, nil
}

func initMetrics() error {
	var err error

	scoreSubmissionsTotal, err = meter.Int64Counter(
		"score.submissions.total",
		metric.WithDescription("Total number of score submissions"),
	)
	if err != nil {
		return err
	}

	scoreSubmissionErrors, err = meter.Int64Counter(
		"score.submission.errors.total",
		metric.WithDescription("Total number of score submission errors"),
	)
	if err != nil {
		return err
	}

	cacheHitTotal, err = meter.Int64Counter(
		"cache.hits.total",
		metric.WithDescription("Total number of cache hits"),
	)
	if err != nil {
		return err
	}

	cacheMissTotal, err = meter.Int64Counter(
		"cache.misses.total",
		metric.WithDescription("Total number of cache misses"),
	)
	if err != nil {
		return err
	}

	scoreValidationDuration, err = meter.Float64Histogram(
		"score.validation.duration.seconds",
		metric.WithDescription("Duration of score validation in seconds"),
	)
	if err != nil {
		return err
	}

	dbQueryDuration, err = meter.Float64Histogram(
		"db.query.duration.seconds",
		metric.WithDescription("Duration of database queries in seconds"),
	)
	if err != nil {
		return err
	}

	redisOpDuration, err = meter.Float64Histogram(
		"redis.operation.duration.seconds",
		metric.WithDescription("Duration of Redis operations in seconds"),
	)
	if err != nil {
		return err
	}

	httpServerRequestDuration, err = meter.Float64Histogram(
		"http.server.request.duration.seconds",
		metric.WithDescription("Duration of HTTP server requests in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}

	httpServerRequestsTotal, err = meter.Int64Counter(
		"http.server.requests.total",
		metric.WithDescription("Total number of HTTP server requests"),
	)
	if err != nil {
		return err
	}

	return nil
}

func connectDB(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := getEnv("DATABASE_URL", "postgres://spicerunner:spicerunner@localhost:5432/leaderboard?sslmode=disable")

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection with retries
	maxRetries := 10
	for i := 0; i < maxRetries; i++ {
		if err := pool.Ping(ctx); err == nil {
			log.Println("✅ Connected to PostgreSQL")
			return pool, nil
		}
		log.Printf("⏳ Waiting for PostgreSQL (attempt %d/%d)...", i+1, maxRetries)
		time.Sleep(2 * time.Second)
	}

	return nil, fmt.Errorf("failed to connect to database after %d retries", maxRetries)
}

func initDB(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, span := tracer.Start(ctx, "initDB")
	defer span.End()

	query := `
		CREATE TABLE IF NOT EXISTS scores (
			id SERIAL PRIMARY KEY,
			player_name VARCHAR(100) NOT NULL,
			score INTEGER NOT NULL,
			session_id VARCHAR(100) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
		CREATE INDEX IF NOT EXISTS idx_scores_player_name ON scores(player_name);
		CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_scores_session_id ON scores(session_id);
	`

	if _, err := pool.Exec(ctx, query); err != nil {
		return fmt.Errorf("failed to initialize database schema: %w", err)
	}

	log.Println("✅ Database schema initialized")
	return nil
}

func connectRedis() *redis.Client {
	addr := getEnv("REDIS_URL", "localhost:6379")
	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	// Test connection with retries
	ctx := context.Background()
	maxRetries := 10
	for i := 0; i < maxRetries; i++ {
		if err := client.Ping(ctx).Err(); err == nil {
			log.Println("✅ Connected to Redis")
			return client
		}
		log.Printf("⏳ Waiting for Redis (attempt %d/%d)...", i+1, maxRetries)
		time.Sleep(2 * time.Second)
	}

	log.Println("⚠️ Redis connection failed, continuing without cache")
	return client
}

func (app *App) healthHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	health := map[string]interface{}{
		"status":  "healthy",
		"service": serviceName,
		"version": serviceVersion,
	}

	// Check database
	if err := app.db.Ping(ctx); err != nil {
		health["status"] = "unhealthy"
		health["database"] = "down"
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		health["database"] = "up"
	}

	// Check Redis
	if err := app.redis.Ping(ctx).Err(); err != nil {
		health["redis"] = "down"
	} else {
		health["redis"] = "up"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func (app *App) submitScoreHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ctx, span := tracer.Start(ctx, "submitScore")
	defer span.End()

	var submission ScoreSubmission
	if err := json.NewDecoder(r.Body).Decode(&submission); err != nil {
		span.RecordError(err)
		scoreSubmissionErrors.Add(ctx, 1, metric.WithAttributes(attribute.String("error", "invalid_json")))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	span.SetAttributes(
		attribute.String("player.name", submission.PlayerName),
		attribute.Int("game.score", submission.Score),
		attribute.String("game.session_id", submission.SessionID),
	)

	// Validate score
	if err := app.validateScore(ctx, &submission); err != nil {
		span.RecordError(err)
		span.SetAttributes(attribute.Bool("validation.passed", false))
		scoreSubmissionErrors.Add(ctx, 1, metric.WithAttributes(attribute.String("error", "validation_failed")))
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	span.SetAttributes(attribute.Bool("validation.passed", true))

	// Insert score into database
	scoreID, err := app.insertScore(ctx, &submission)
	if err != nil {
		span.RecordError(err)
		scoreSubmissionErrors.Add(ctx, 1, metric.WithAttributes(attribute.String("error", "db_insert_failed")))
		http.Error(w, "Failed to save score", http.StatusInternalServerError)
		return
	}

	// Invalidate cache
	app.invalidateCache(ctx)

	// Calculate rank
	rank, err := app.calculateRank(ctx, submission.Score)
	if err != nil {
		log.Printf("Failed to calculate rank: %v", err)
		rank = -1
	}
	span.SetAttributes(attribute.Int("rank.calculated", rank))

	scoreSubmissionsTotal.Add(ctx, 1)

	response := ScoreResponse{
		ID:         scoreID,
		PlayerName: submission.PlayerName,
		Score:      submission.Score,
		Rank:       rank,
		CreatedAt:  time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (app *App) validateScore(ctx context.Context, submission *ScoreSubmission) error {
	ctx, span := tracer.Start(ctx, "validateScore")
	defer span.End()

	start := time.Now()
	defer func() {
		scoreValidationDuration.Record(ctx, time.Since(start).Seconds())
	}()

	// Basic validation
	if submission.PlayerName == "" {
		submission.PlayerName = "Anonymous"
	}
	if len(submission.PlayerName) > 100 {
		return fmt.Errorf("player name too long (max 100 characters)")
	}
	if submission.Score < 0 {
		span.SetAttributes(attribute.Bool("validation.suspicious", true))
		return fmt.Errorf("invalid score: negative value")
	}
	if submission.SessionID == "" {
		return fmt.Errorf("session ID required")
	}

	// Anti-cheat: Check for unrealistic scores
	if submission.Score > maxRealisticScore {
		span.SetAttributes(attribute.Bool("validation.suspicious", true))
		return fmt.Errorf("score too high (max %d)", maxRealisticScore)
	}

	// Anti-cheat: Check submission rate
	if err := app.checkSubmissionRate(ctx, submission.SessionID); err != nil {
		span.SetAttributes(attribute.Bool("validation.suspicious", true))
		return err
	}

	return nil
}

func (app *App) checkSubmissionRate(ctx context.Context, sessionID string) error {
	ctx, span := tracer.Start(ctx, "checkSubmissionRate")
	defer span.End()

	start := time.Now()
	defer func() {
		dbQueryDuration.Record(ctx, time.Since(start).Seconds(),
			metric.WithAttributes(attribute.String("query.type", "check_submission_rate")))
	}()

	var lastSubmission time.Time
	query := `SELECT created_at FROM scores WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`

	err := app.db.QueryRow(ctx, query, sessionID).Scan(&lastSubmission)
	if err != nil {
		// No previous submission found, allow this one
		return nil
	}

	timeSinceLastSubmission := time.Since(lastSubmission)
	if timeSinceLastSubmission < minScoreSubmissionInterval {
		span.SetAttributes(
			attribute.String("anti_cheat.reason", "submission_rate_exceeded"),
			attribute.Float64("time_since_last_submission_seconds", timeSinceLastSubmission.Seconds()),
		)
		return fmt.Errorf("please wait %v between submissions", minScoreSubmissionInterval-timeSinceLastSubmission)
	}

	return nil
}

func (app *App) insertScore(ctx context.Context, submission *ScoreSubmission) (int, error) {
	ctx, span := tracer.Start(ctx, "insertScore")
	defer span.End()

	start := time.Now()
	defer func() {
		dbQueryDuration.Record(ctx, time.Since(start).Seconds(),
			metric.WithAttributes(attribute.String("query.type", "insert")))
	}()

	span.SetAttributes(
		attribute.String("db.system", "postgresql"),
		attribute.String("db.operation", "INSERT"),
	)

	var id int
	query := `INSERT INTO scores (player_name, score, session_id) VALUES ($1, $2, $3) RETURNING id`
	err := app.db.QueryRow(ctx, query, submission.PlayerName, submission.Score, submission.SessionID).Scan(&id)

	return id, err
}

func (app *App) invalidateCache(ctx context.Context) {
	ctx, span := tracer.Start(ctx, "invalidateCache")
	defer span.End()

	start := time.Now()
	defer func() {
		redisOpDuration.Record(ctx, time.Since(start).Seconds(),
			metric.WithAttributes(attribute.String("operation", "delete")))
	}()

	// Delete top scores cache
	if err := app.redis.Del(ctx, cacheKeyTopScores).Err(); err != nil {
		log.Printf("Failed to invalidate cache: %v", err)
	}
}

func (app *App) calculateRank(ctx context.Context, score int) (int, error) {
	ctx, span := tracer.Start(ctx, "calculateRank")
	defer span.End()

	// Try cache first
	cacheKey := fmt.Sprintf(cacheKeyPlayerRank, score)
	cachedRank, err := app.redis.Get(ctx, cacheKey).Int()
	if err == nil {
		cacheHitTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("cache.key", "player_rank")))
		span.SetAttributes(attribute.Bool("cache.hit", true))
		return cachedRank, nil
	}

	cacheMissTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("cache.key", "player_rank")))
	span.SetAttributes(attribute.Bool("cache.hit", false))

	// Cache miss - query database
	start := time.Now()
	var rank int
	query := `SELECT COUNT(*) + 1 FROM scores WHERE score > $1`
	err = app.db.QueryRow(ctx, query, score).Scan(&rank)

	dbQueryDuration.Record(ctx, time.Since(start).Seconds(),
		metric.WithAttributes(attribute.String("query.type", "count")))

	if err != nil {
		return 0, err
	}

	// Cache the result
	app.redis.Set(ctx, cacheKey, rank, cacheTTL)

	return rank, nil
}

func (app *App) getTopScoresHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ctx, span := tracer.Start(ctx, "getTopScores")
	defer span.End()

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}
	span.SetAttributes(attribute.Int("query.limit", limit))

	// Try cache first
	var leaderboard []LeaderboardEntry
	cachedData, err := app.redis.Get(ctx, cacheKeyTopScores).Result()
	if err == nil {
		cacheHitTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("cache.key", "top_scores")))
		span.SetAttributes(attribute.Bool("cache.hit", true))

		if err := json.Unmarshal([]byte(cachedData), &leaderboard); err == nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(leaderboard)
			return
		}
	}

	cacheMissTotal.Add(ctx, 1, metric.WithAttributes(attribute.String("cache.key", "top_scores")))
	span.SetAttributes(attribute.Bool("cache.hit", false))

	// Cache miss - query database
	start := time.Now()
	query := `
		SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, player_name, score, created_at
		FROM scores
		ORDER BY score DESC
		LIMIT $1
	`
	rows, err := app.db.Query(ctx, query, limit)
	if err != nil {
		span.RecordError(err)
		http.Error(w, "Failed to fetch leaderboard", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	dbQueryDuration.Record(ctx, time.Since(start).Seconds(),
		metric.WithAttributes(attribute.String("query.type", "select_top")))

	for rows.Next() {
		var entry LeaderboardEntry
		if err := rows.Scan(&entry.Rank, &entry.PlayerName, &entry.Score, &entry.CreatedAt); err != nil {
			log.Printf("Failed to scan row: %v", err)
			continue
		}
		leaderboard = append(leaderboard, entry)
	}

	// Cache the result
	if jsonData, err := json.Marshal(leaderboard); err == nil {
		app.redis.Set(ctx, cacheKeyTopScores, jsonData, cacheTTL)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(leaderboard)
}

func (app *App) getPlayerStatsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ctx, span := tracer.Start(ctx, "getPlayerStats")
	defer span.End()

	vars := mux.Vars(r)
	playerName := vars["name"]
	span.SetAttributes(attribute.String("player.name", playerName))

	start := time.Now()

	// Get best score and rank
	var bestScore int
	query := `SELECT COALESCE(MAX(score), 0) FROM scores WHERE player_name = $1`
	err := app.db.QueryRow(ctx, query, playerName).Scan(&bestScore)
	if err != nil {
		span.RecordError(err)
		http.Error(w, "Failed to fetch player stats", http.StatusInternalServerError)
		return
	}

	// Calculate rank
	rank, _ := app.calculateRank(ctx, bestScore)

	// Get total games
	var totalGames int
	query = `SELECT COUNT(*) FROM scores WHERE player_name = $1`
	err = app.db.QueryRow(ctx, query, playerName).Scan(&totalGames)
	if err != nil {
		totalGames = 0
	}

	// Get recent scores
	query = `
		SELECT score, created_at
		FROM scores
		WHERE player_name = $1
		ORDER BY created_at DESC
		LIMIT 10
	`
	rows, err := app.db.Query(ctx, query, playerName)
	if err != nil {
		span.RecordError(err)
		http.Error(w, "Failed to fetch recent scores", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var recentScores []LeaderboardEntry
	for rows.Next() {
		var entry LeaderboardEntry
		entry.PlayerName = playerName
		if err := rows.Scan(&entry.Score, &entry.CreatedAt); err != nil {
			continue
		}
		recentScores = append(recentScores, entry)
	}

	dbQueryDuration.Record(ctx, time.Since(start).Seconds(),
		metric.WithAttributes(attribute.String("query.type", "player_stats")))

	stats := PlayerStats{
		PlayerName:   playerName,
		BestScore:    bestScore,
		CurrentRank:  rank,
		TotalGames:   totalGames,
		RecentScores: recentScores,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func httpMetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ctx := r.Context()

		// Create a response writer wrapper to capture status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Serve the request
		next.ServeHTTP(wrapped, r)

		// Record metrics
		duration := time.Since(start).Seconds()
		route := r.URL.Path
		method := r.Method
		status := strconv.Itoa(wrapped.statusCode)

		attrs := metric.WithAttributes(
			attribute.String("http.method", method),
			attribute.String("http.route", route),
			attribute.String("http.status_code", status),
		)

		httpServerRequestDuration.Record(ctx, duration, attrs)
		httpServerRequestsTotal.Add(ctx, 1, attrs)
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, traceparent")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
