package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	fylogger "github.com/FyersDev/trading-logger-go"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var jwtSecret []byte
var libreJWTSecret []byte
var libreJWTRefreshSecret []byte
var libreBackend string
var libreFrontend string
var cookieName = "libre_jwt"
var mongoURI string
var mainAPIURL string
var useHTTPS bool    // Whether cookies should have Secure flag
var serverHTTPS bool // Whether server itself runs HTTPS (needs certificates)
var basePath string  // Configurable base path prefix (e.g., "/research")

// APIUser is the subset of Nucleus user fields we persist into LibreChat Mongo.
type APIUser struct {
	Email         string  `json:"email"`
	FirstName     *string `json:"first_name,omitempty"`
	LastName      *string `json:"last_name,omitempty"`
	FullName      string  `json:"full_name"`
	AvatarURL     *string `json:"avatar_url,omitempty"`
	EmailVerified bool    `json:"email_verified"`
}

func getLibreBackend() string {
	if target := os.Getenv("LIBRE_BACKEND"); target != "" {
		return target
	}
	return "http://localhost:3080" // Default LibreChat backend port
}

func getLibreFrontend() string {
	if target := os.Getenv("LIBRE_FRONTEND"); target != "" {
		return target
	}
	return "http://localhost:3090" // Default LibreChat frontend port
}

func getMongoURI() string {
	if uri := os.Getenv("MONGO_URI"); uri != "" {
		return uri
	}
	return "mongodb://localhost:27017/LibreChat" // Default MongoDB URI
}

func getMainAPIURL() string {
	if url := os.Getenv("MAIN_API_URL"); url != "" {
		return url
	}
	return "http://localhost:8080" // Default main API URL
}

func getBasePath() string {
	if path := os.Getenv("PROXY_BASE_PATH"); path != "" {
		// Ensure it starts with / and doesn't end with /
		path = strings.TrimSpace(path)
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		path = strings.TrimSuffix(path, "/")
		return path
	}
	return "/research" // Default base path for backward compatibility
}

func init() {
	// Try multiple paths to find .env file
	envPaths := []string{
		".env",       // Current directory
		"../.env",    // Parent directory
		"../../.env", // Two levels up
	}

	envLoaded := false
	for _, path := range envPaths {
		if err := godotenv.Load(path); err == nil {
			log.Printf("Loaded .env from: %s", path)
			envLoaded = true
			break
		}
	}

	if !envLoaded {
		log.Printf("WARNING: No .env file found, trying to read from environment variables")
	}

	// Read environment variables after loading .env
	jwtSecret = []byte(os.Getenv("JWT_SECRET"))
	libreJWTSecret = []byte(os.Getenv("LIBRE_JWT_SECRET"))
	libreJWTRefreshSecret = []byte(os.Getenv("LIBRE_JWT_REFRESH_SECRET"))

	// If still not set, try reading from JWT_SECRET and JWT_REFRESH_SECRET (LibreChat's naming)
	if len(libreJWTSecret) == 0 {
		libreJWTSecret = []byte(os.Getenv("JWT_SECRET"))
	}
	if len(libreJWTRefreshSecret) == 0 {
		libreJWTRefreshSecret = []byte(os.Getenv("JWT_REFRESH_SECRET"))
	}

	mongoURI = getMongoURI()
	libreBackend = getLibreBackend()
	libreFrontend = getLibreFrontend()
	mainAPIURL = getMainAPIURL()
	basePath = getBasePath()

	if len(jwtSecret) == 0 {
		jwtSecret = []byte("mysecret123") // fallback for development
		log.Println("Warning: Using default JWT secret. Set JWT_SECRET environment variable in production.")
	}

	// If LibreChat JWT secrets are still not set, use the known values from LibreChat's .env
	if len(libreJWTSecret) == 0 {
		log.Println("WARNING: LIBRE_JWT_SECRET not found in .env - using hardcoded fallback")
		libreJWTSecret = []byte("16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef")
		log.Println("Using hardcoded LIBRE_JWT_SECRET - ensure this matches LibreChat's JWT_SECRET")
	}
	if len(libreJWTRefreshSecret) == 0 {
		log.Println("WARNING: LIBRE_JWT_REFRESH_SECRET not found in .env - using hardcoded fallback")
		libreJWTRefreshSecret = []byte("eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418")
		log.Println("Using hardcoded LIBRE_JWT_REFRESH_SECRET - ensure this matches LibreChat's JWT_REFRESH_SECRET")
	}

	log.Printf("proxy: backend=%s frontend=%s mainAPI=%s mongoDB=%s basePath=%s",
		libreBackend, libreFrontend, mainAPIURL, mongoURI, basePath)
}

// getNext6AMIST returns the next 6 AM IST time (which is 12:30 AM UTC)
func getNext6AMIST() time.Time {
	// IST is UTC+5:30, so 6 AM IST = 12:30 AM UTC
	now := time.Now().UTC()

	// Calculate today's 12:30 AM UTC (which is 6 AM IST)
	next6AMUTC := time.Date(now.Year(), now.Month(), now.Day(), 0, 30, 0, 0, time.UTC)

	// If it's already past 12:30 AM UTC today, set to 12:30 AM UTC tomorrow
	if now.After(next6AMUTC) {
		next6AMUTC = next6AMUTC.Add(24 * time.Hour)
	}

	return next6AMUTC
}

// get6AMAfterDays returns 6 AM IST after the specified number of days (which is 12:30 AM UTC)
func get6AMAfterDays(days int) time.Time {
	// IST is UTC+5:30, so 6 AM IST = 12:30 AM UTC
	now := time.Now().UTC()

	// Add the specified number of days
	futureDate := now.Add(time.Duration(days) * 24 * time.Hour)

	// Set to 12:30 AM UTC on that future date (which is 6 AM IST)
	expiry6AMUTC := time.Date(futureDate.Year(), futureDate.Month(), futureDate.Day(), 0, 30, 0, 0, time.UTC)

	return expiry6AMUTC
}

// setCORSHeaders sets CORS headers for cross-origin requests
func setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Max-Age", "3600")
}

// createOrUpdateLibreChatUser creates or updates a user in LibreChat's MongoDB
func createOrUpdateLibreChatUser(user *APIUser, refreshToken string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Printf("Attempting to connect to MongoDB: %s", mongoURI)

	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI(mongoURI)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Printf("MongoDB connection error: %v", err)
		return "", fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	defer func() {
		if err := client.Disconnect(ctx); err != nil {
			log.Printf("Error disconnecting from MongoDB: %v", err)
		}
	}()

	// Ping MongoDB to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		log.Printf("MongoDB ping failed: %v", err)
		return "", fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	log.Printf("MongoDB connection successful")

	// Extract database name from URI or use default
	dbName := "LibreChat"
	parsedURI, err := url.Parse(mongoURI)
	if err == nil && parsedURI.Path != "" {
		path := strings.TrimPrefix(parsedURI.Path, "/")
		if idx := strings.Index(path, "?"); idx > 0 {
			path = path[:idx]
		}
		if path != "" {
			dbName = path
		}
	} else {
		// Fallback: extract from string directly
		if strings.Contains(mongoURI, "/") {
			parts := strings.Split(mongoURI, "/")
			if len(parts) > 1 {
				dbPart := parts[len(parts)-1]
				if idx := strings.Index(dbPart, "?"); idx > 0 {
					dbPart = dbPart[:idx]
				}
				if dbPart != "" && !strings.Contains(dbPart, ":") {
					dbName = dbPart
				}
			}
		}
	}

	log.Printf("Using database: %s, collection: users", dbName)

	// Get database and collection
	db := client.Database(dbName)
	collection := db.Collection("users")

	// Generate username from email (take part before @)
	username := strings.Split(user.Email, "@")[0]

	// Generate name from FullName or FirstName/LastName
	name := user.FullName
	if name == "" {
		if user.FirstName != nil && user.LastName != nil {
			name = *user.FirstName + " " + *user.LastName
		} else if user.FirstName != nil {
			name = *user.FirstName
		} else if user.LastName != nil {
			name = *user.LastName
		} else {
			name = username
		}
	}
	if name == "" {
		name = username
	}

	// Prepare refresh token array
	refreshTokenArray := []interface{}{}
	if refreshToken != "" {
		refreshTokenArray = []interface{}{refreshToken}
	}

	// Prepare LibreChat user document
	libreUserDoc := bson.M{
		"name":             name,
		"username":         username,
		"email":            user.Email,
		"emailVerified":    user.EmailVerified,
		"avatar":           user.AvatarURL,
		"provider":         "header",
		"role":             "USER",
		"plugins":          []interface{}{},
		"twoFactorEnabled": false,
		"termsAccepted":    false,
		"personalization":  bson.M{},
		"backupCodes":      []interface{}{},
		"refreshToken":     refreshTokenArray,
		"createdAt":        time.Now(),
		"updatedAt":        time.Now(),
		"__v":              0,
	}

	// Check if user already exists
	filter := bson.M{"email": user.Email}
	var existingUserDoc bson.M

	err = collection.FindOne(ctx, filter).Decode(&existingUserDoc)
	userExists := err == nil
	hasDecodeError := err != nil && strings.Contains(err.Error(), "refreshToken")

	var mongoUserID string

	if err == mongo.ErrNoDocuments {
		// User doesn't exist, create new
		log.Printf("User not found, creating new user: %s (%s) for chat history", name, user.Email)

		result, err := collection.InsertOne(ctx, libreUserDoc)
		if err != nil {
			log.Printf("MongoDB insert error: %v", err)
			return "", fmt.Errorf("failed to create user in MongoDB: %w", err)
		}

		if oid, ok := result.InsertedID.(primitive.ObjectID); ok {
			mongoUserID = oid.Hex()
		}
		log.Printf("Successfully created LibreChat user: %s (%s) with ID: %v (for chat history)", name, user.Email, result.InsertedID)
	} else if err != nil && !hasDecodeError {
		log.Printf("MongoDB find error: %v", err)
		return "", fmt.Errorf("failed to check existing user: %w", err)
	}

	// User exists (or we're continuing despite decode error), update it
	if userExists || hasDecodeError {
		if hasDecodeError {
			log.Printf("RefreshToken decoding error, but user exists. Continuing with update...")
		}

		log.Printf("User exists, updating: %s (%s)", name, user.Email)

		update := bson.M{
			"$set": bson.M{
				"name":          name,
				"username":      username,
				"emailVerified": user.EmailVerified,
				"avatar":        user.AvatarURL,
				"updatedAt":     time.Now(),
			},
		}

		// Check refreshToken field type and convert to array if needed
		var existingDoc bson.M
		if err := collection.FindOne(ctx, filter).Decode(&existingDoc); err == nil {
			if refreshToken != "" {
				existingRefreshToken := existingDoc["refreshToken"]
				if existingRefreshToken == nil {
					update["$set"].(bson.M)["refreshToken"] = []interface{}{refreshToken}
					log.Printf("Setting refreshToken as new array for user: %s", user.Email)
				} else {
					switch v := existingRefreshToken.(type) {
					case primitive.A, []interface{}:
						update["$addToSet"] = bson.M{
							"refreshToken": refreshToken,
						}
						log.Printf("Adding refresh token to array for user: %s", user.Email)
					default:
						update["$set"].(bson.M)["refreshToken"] = []interface{}{refreshToken}
						log.Printf("Converting refreshToken from %T to array for user: %s", v, user.Email)
					}
				}
			}
		} else if refreshToken != "" {
			update["$set"].(bson.M)["refreshToken"] = []interface{}{refreshToken}
			log.Printf("Setting refreshToken as new array for user: %s", user.Email)
		}

		result, err := collection.UpdateOne(ctx, filter, update)
		if err != nil {
			log.Printf("MongoDB update error: %v", err)
			return "", fmt.Errorf("failed to update user in MongoDB: %w", err)
		}

		log.Printf("Successfully updated LibreChat user: %s (%s), Matched: %d, Modified: %d",
			name, user.Email, result.MatchedCount, result.ModifiedCount)

		if refreshToken != "" {
			log.Printf("Added refresh token to LibreChat user: %s", user.Email)
		}

		// Get the user ID from existing document
		var updatedDoc bson.M
		if err := collection.FindOne(ctx, filter).Decode(&updatedDoc); err == nil {
			if id, ok := updatedDoc["_id"].(primitive.ObjectID); ok {
				mongoUserID = id.Hex()
			}
		}
	}

	return mongoUserID, nil
}

// createLibreChatSession creates a session in MongoDB for LibreChat authentication
func createLibreChatSession(userID string) (string, error) {
	if userID == "" {
		return "", fmt.Errorf("userID is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Printf("Creating LibreChat session - connecting to MongoDB: %s", mongoURI)

	clientOptions := options.Client().ApplyURI(mongoURI)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Printf("MongoDB connection error in createLibreChatSession: %v", err)
		return "", fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	defer func() {
		if err := client.Disconnect(ctx); err != nil {
			log.Printf("Error disconnecting from MongoDB: %v", err)
		}
	}()

	// Ping MongoDB to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		log.Printf("MongoDB ping failed in createLibreChatSession: %v", err)
		return "", fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	log.Printf("MongoDB connection verified for session creation")

	// Parse database name from URI
	dbName := "LibreChat"
	parsedURI, err := url.Parse(mongoURI)
	if err == nil && parsedURI.Path != "" {
		dbPart := strings.TrimPrefix(parsedURI.Path, "/")
		if dbPart != "" && !strings.Contains(dbPart, ":") {
			dbName = dbPart
		}
	}

	db := client.Database(dbName)
	sessionsCollection := db.Collection("sessions")

	// Convert userID string to ObjectID
	userObjectID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return "", fmt.Errorf("invalid user ID: %w", err)
	}

	// LibreChat's session creation flow:
	// 1. Create session document first (to get session._id)
	// 2. Generate JWT with id (userID) and sessionId (session._id)
	// 3. Hash the JWT token using SHA-256
	// 4. Store refreshTokenHash (hashed) in session, NOT refreshToken (raw)
	// 5. Return raw (unhashed) token for cookie

	if len(libreJWTRefreshSecret) == 0 {
		return "", fmt.Errorf("LIBRE_JWT_REFRESH_SECRET not set")
	}

	// Get 6 AM IST after 7 days for session expiration
	expirationTime := get6AMAfterDays(7)

	// Step 1: Create session document first (without refreshTokenHash - we'll update it)
	sessionDoc := bson.M{
		"user":       userObjectID,
		"expiration": expirationTime,
		"createdAt":  time.Now(),
		"updatedAt":  time.Now(),
		"managedBy":  "proxy",
	}

	result, err := sessionsCollection.InsertOne(ctx, sessionDoc)
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	sessionObjectID := result.InsertedID.(primitive.ObjectID)
	sessionID := sessionObjectID.Hex()

	// Step 2: Generate JWT with id (userID) and sessionId (session._id) - expires at 6 AM IST
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":        userID,    // User ID as string
		"sessionId": sessionID, // Session ID as string
		"exp":       expirationTime.Unix(),
		"iat":       time.Now().Unix(),
	})

	refreshTokenString, err := refreshToken.SignedString(libreJWTRefreshSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign refresh token: %w", err)
	}

	// Step 3: Hash the refresh token using SHA-256 (matching LibreChat's hashToken function)
	hash := sha256.Sum256([]byte(refreshTokenString))
	refreshTokenHash := hex.EncodeToString(hash[:])

	// Step 4: Update session with refreshTokenHash (NOT refreshToken)
	update := bson.M{
		"$set": bson.M{
			"refreshTokenHash": refreshTokenHash,
			"updatedAt":        time.Now(),
		},
	}

	_, err = sessionsCollection.UpdateOne(ctx, bson.M{"_id": sessionObjectID}, update)
	if err != nil {
		return "", fmt.Errorf("failed to update session with refreshTokenHash: %w", err)
	}

	log.Printf("Created LibreChat session for user %s: %s (with refreshTokenHash stored)", userID, sessionID)

	// Step 5: Return raw (unhashed) token for cookie
	return refreshTokenString, nil
}

// extractUserFromFyersToken decodes a FYERS SSO JWT and fetches user details from FYERS API.
// Returns email + display name from the API. Returns empty strings if validation fails.
// New token format: client_id, org_id (prefixed with INSTI~)
func extractUserFromFyersToken(tokenString string) (email string, displayName string, valid bool) {
	parser := jwt.NewParser()
	token, _, err := parser.ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		log.Printf("extractUserFromFyersToken: Failed to parse JWT: %v", err)
		return "", "", false
	}

	claims, isClaims := token.Claims.(jwt.MapClaims)
	if !isClaims {
		log.Printf("extractUserFromFyersToken: Claims are not MapClaims")
		return "", "", false
	}

	// Verify issuer
	iss, _ := claims["iss"].(string)
	if !strings.Contains(iss, "insti.fyers.in") {
		log.Printf("extractUserFromFyersToken: Invalid issuer: %s (expected insti.fyers.in)", iss)
		return "", "", false
	}

	// Extract client_id (required)
	clientID, hasClientID := claims["client_id"].(string)
	if !hasClientID || clientID == "" {
		log.Printf("extractUserFromFyersToken: client_id not found in token")
		return "", "", false
	}

	log.Printf("extractUserFromFyersToken: Token validated (client_id: %s)", clientID)
	
	// Call FYERS API to get user details (required - no fallback)
	email, displayName, err = fetchUserDetailsFromFyersAPI(tokenString)
	if err != nil {
		log.Printf("extractUserFromFyersToken: Failed to fetch user details from API: %v", err)
		return "", "", false
	}
	
	log.Printf("extractUserFromFyersToken: Successfully fetched from API - email: %s, name: %s", email, displayName)
	return email, displayName, true
}

// fetchUserDetailsFromFyersAPI calls the FYERS API to get user details
func fetchUserDetailsFromFyersAPI(tokenString string) (email string, displayName string, err error) {
	apiURL := "https://api-t2.fyers.in/insti/admin/user-details"

	// Create request
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set authorization header with INSTI~ prefix
	req.Header.Set("Authorization", "INSTI~"+tokenString)

	// Set headers to bypass Cloudflare and look like a real browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")

	// Make request with timeout
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return "", "", fmt.Errorf("failed to read response: %w", readErr)
	}

	// Parse response - API now returns wrapped format with code, s, data fields
	var apiResponse struct {
		Code    int    `json:"code"`
		Status  string `json:"s"`
		Message string `json:"message,omitempty"`
		Data    struct {
			ID              int    `json:"id"`
			Name            string `json:"name"`
			Email           string `json:"email"`
			Mobile          string `json:"mobile,omitempty"`
			FyID            string `json:"fyId"`
			Role            string `json:"role"`
			Status          string `json:"status"`
			InstitutionID   int    `json:"institutionId"`
			InstitutionName string `json:"institutionName"`
			JobTitle        string `json:"jobTitle,omitempty"`
		} `json:"data,omitempty"`
	}

	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return "", "", fmt.Errorf("failed to parse API response: %w", err)
	}

	// Check response status and code
	if apiResponse.Status != "ok" || apiResponse.Code != 200 {
		// Handle error responses
		errorMsg := apiResponse.Message
		if errorMsg == "" {
			errorMsg = string(body)
		}
		
		switch apiResponse.Code {
		case 401:
			return "", "", fmt.Errorf("authentication required: %s", errorMsg)
		case 403:
			return "", "", fmt.Errorf("FYERS token required: %s", errorMsg)
		case 400:
			return "", "", fmt.Errorf("invalid token: %s", errorMsg)
		case 404:
			return "", "", fmt.Errorf("user not found: %s", errorMsg)
		case 500:
			return "", "", fmt.Errorf("internal server error: %s", errorMsg)
		default:
			return "", "", fmt.Errorf("API error (code %d): %s", apiResponse.Code, errorMsg)
		}
	}

	// Validate user data
	if apiResponse.Data.Email == "" {
		return "", "", fmt.Errorf("email not found in API response")
	}

	email = apiResponse.Data.Email
	displayName = apiResponse.Data.Name
	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}

	log.Printf("fetchUserDetailsFromFyersAPI: Fetched user - email: %s, name: %s, fyId: %s, role: %s",
		email, displayName, apiResponse.Data.FyID, apiResponse.Data.Role)

	return email, displayName, nil
}

// sanitizeEmbedRedirect returns a same-origin relative path for post-login redirect.
// Rejects open redirects (//evil.com, https:, @, etc.). Optional query string is kept.
// Ensures path starts with the configured base path prefix.
func sanitizeEmbedRedirect(raw string) string {
	defaultPath := basePath + "/c/new"
	if strings.TrimSpace(raw) == "" {
		return defaultPath
	}
	decoded, err := url.QueryUnescape(strings.TrimSpace(raw))
	if err != nil {
		decoded = strings.TrimSpace(raw)
	} else {
		decoded = strings.TrimSpace(decoded)
	}
	if len(decoded) > 2048 {
		return defaultPath
	}

	pathPart := decoded
	queryPart := ""
	if i := strings.IndexByte(decoded, '?'); i >= 0 {
		pathPart = decoded[:i]
		queryPart = decoded[i:]
	}
	if !strings.HasPrefix(pathPart, "/") || strings.HasPrefix(pathPart, "//") {
		return defaultPath
	}
	combined := strings.ToLower(pathPart + queryPart)
	if strings.Contains(combined, "://") || strings.Contains(decoded, "@") {
		return defaultPath
	}
	if strings.Contains(pathPart, "\\") {
		return defaultPath
	}
	pathPart = path.Clean(pathPart)
	if !strings.HasPrefix(pathPart, "/") || strings.HasPrefix(pathPart, "//") {
		return defaultPath
	}

	// Ensure path starts with the configured base path prefix
	basePathWithSlash := basePath + "/"
	if !strings.HasPrefix(pathPart, basePathWithSlash) {
		// If user provided a path like /templates, convert to {basePath}/templates
		if strings.HasPrefix(pathPart, "/") {
			pathPart = basePath + pathPart
		} else {
			return defaultPath
		}
	}

	return pathPart + queryPart
}

// sanitizeEmbedTheme returns a safe theme token for forwarding (LibreChat: light | dark | system).
func sanitizeEmbedTheme(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" || len(s) > 32 {
		return ""
	}
	switch strings.ToLower(s) {
	case "light", "dark", "system":
		return strings.ToLower(s)
	default:
		return ""
	}
}

// appendRedirectQueryIfAbsent adds key=value to a relative path's query string only if key is not already set.
func appendRedirectQueryIfAbsent(relPath, key, value string) string {
	pathPart := relPath
	queryPart := ""
	if i := strings.IndexByte(relPath, '?'); i >= 0 {
		pathPart = relPath[:i]
		queryPart = relPath[i+1:]
	}
	v, err := url.ParseQuery(queryPart)
	if err != nil {
		v = url.Values{}
	}
	if strings.TrimSpace(v.Get(key)) != "" {
		return relPath
	}
	v.Set(key, value)
	enc := v.Encode()
	if enc == "" {
		return pathPart
	}
	return pathPart + "?" + enc
}

// stripRedirectQueryKey removes key from a relative path's query string (no-op if there is no query).
func stripRedirectQueryKey(relPath, key string) string {
	pathPart := relPath
	queryPart := ""
	if i := strings.IndexByte(relPath, '?'); i >= 0 {
		pathPart = relPath[:i]
		queryPart = relPath[i+1:]
	}
	if queryPart == "" {
		return pathPart
	}
	v, err := url.ParseQuery(queryPart)
	if err != nil {
		return pathPart
	}
	v.Del(key)
	if len(v) == 0 {
		return pathPart
	}
	return pathPart + "?" + v.Encode()
}

// auditFields prepares fylogger additionalData (structured JSON) for proxy audit lines.
func auditFields(fields map[string]string) map[string]interface{} {
	m := make(map[string]interface{}, len(fields)+1)
	m["service"] = "insti-proxy"
	for k, v := range fields {
		m[k] = v
	}
	return m
}

// embedHandler handles GET /auth/embed?token=<FYERS_SSO_TOKEN>&redirect=/c/new
// Also accepts next= or return_to= as redirect aliases (same sanitization).
// theme=light|dark|system on the embed URL is forwarded onto the redirect (if not already set).
// If the embed URL has no valid theme, any theme= in redirect/next/return_to is stripped from the final redirect.
// It validates the token, syncs the user, sets auth cookies, and redirects.
func embedHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ssoToken := r.URL.Query().Get("token")
	if ssoToken == "" {
		fylogger.InfoLog(r.Context(), "embed_rejected", auditFields(map[string]string{"reason": "missing_token", "http_status": "400"}))
		http.Error(w, "token parameter required", http.StatusBadRequest)
		return
	}

	// Strip "INSTI~" prefix if present (new token format)
	ssoToken = strings.TrimPrefix(ssoToken, "INSTI~")

	redirectRaw := r.URL.Query().Get("redirect")
	if redirectRaw == "" {
		redirectRaw = r.URL.Query().Get("next")
	}
	if redirectRaw == "" {
		redirectRaw = r.URL.Query().Get("return_to")
	}
	redirectPath := sanitizeEmbedRedirect(redirectRaw)
	if t := sanitizeEmbedTheme(r.URL.Query().Get("theme")); t != "" {
		redirectPath = appendRedirectQueryIfAbsent(redirectPath, "theme", t)
	} else {
		redirectPath = stripRedirectQueryKey(redirectPath, "theme")
	}

	// Decode the FYERS SSO token to get user info
	email, fullName, ok := extractUserFromFyersToken(ssoToken)
	if !ok {
		log.Printf("EmbedHandler: Failed to extract user from token")
		fylogger.InfoLog(r.Context(), "embed_rejected", auditFields(map[string]string{"reason": "invalid_token", "http_status": "401"}))
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	if fullName == "" {
		fullName = email
	}

	log.Printf("EmbedHandler: Processing embed login for %s (%s)", email, fullName)

	// Create or update user in LibreChat MongoDB
	apiUser := &APIUser{
		Email:         email,
		FullName:      fullName,
		EmailVerified: true,
	}

	mongoUserID, err := createOrUpdateLibreChatUser(apiUser, ssoToken)
	if err != nil {
		log.Printf("EmbedHandler: Failed to sync user to MongoDB: %v", err)
		fylogger.InfoLog(r.Context(), "embed_rejected", auditFields(map[string]string{"reason": "mongo_user_sync", "email": email, "http_status": "500"}))
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}
	if mongoUserID == "" {
		log.Printf("EmbedHandler: Empty mongoUserID after sync")
		fylogger.InfoLog(r.Context(), "embed_rejected", auditFields(map[string]string{"reason": "empty_mongo_user_id", "email": email, "http_status": "500"}))
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	log.Printf("EmbedHandler: User synced to MongoDB (ID: %s)", mongoUserID)

	// Create LibreChat session and generate refresh token
	refreshTokenString, err := createLibreChatSession(mongoUserID)
	if err != nil {
		log.Printf("EmbedHandler: Failed to create session: %v", err)
		fylogger.InfoLog(r.Context(), "embed_rejected", auditFields(map[string]string{"reason": "session_create", "email": email, "http_status": "500"}))
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	if len(libreJWTSecret) == 0 {
		log.Printf("EmbedHandler: LIBRE_JWT_SECRET not configured")
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return
	}

	// Generate LibreChat access JWT
	username := strings.Split(email, "@")[0]
	next6AM := getNext6AMIST()
	refresh6AM := get6AMAfterDays(7)

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":       mongoUserID,
		"username": username,
		"provider": "proxy",
		"email":    email,
		"exp":      next6AM.Unix(),
		"iat":      time.Now().Unix(),
	})
	accessTokenString, err := accessToken.SignedString(libreJWTSecret)
	if err != nil {
		log.Printf("EmbedHandler: Failed to sign access token: %v", err)
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	// Generate proxy JWT (libre_jwt)
	proxyToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email": email,
		"exp":   next6AM.Unix(),
		"iat":   time.Now().Unix(),
	})
	proxyTokenString, err := proxyToken.SignedString(jwtSecret)
	if err != nil {
		log.Printf("EmbedHandler: Failed to sign proxy token: %v", err)
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	// Determine cookie settings
	sameSiteMode := http.SameSiteLaxMode
	if useHTTPS {
		sameSiteMode = http.SameSiteNoneMode
	}

	// Set all auth cookies
	cookies := []*http.Cookie{
		{
			Name:     "refreshToken",
			Value:    refreshTokenString,
			Path:     "/",
			Expires:  refresh6AM,
			MaxAge:   int(time.Until(refresh6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: true,
			SameSite: sameSiteMode,
		},
		{
			Name:     "token_provider",
			Value:    "proxy",
			Path:     "/",
			Expires:  refresh6AM,
			MaxAge:   int(time.Until(refresh6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: true,
			SameSite: sameSiteMode,
		},
		{
			Name:     cookieName, // libre_jwt
			Value:    proxyTokenString,
			Path:     "/",
			Expires:  next6AM,
			MaxAge:   int(time.Until(next6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: true,
			SameSite: sameSiteMode,
		},
		{
			Name:     "lc_access_token",
			Value:    accessTokenString,
			Path:     "/",
			Expires:  next6AM,
			MaxAge:   int(time.Until(next6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: true,
			SameSite: sameSiteMode,
		},
		{
			Name:     "embedded",
			Value:    "true",
			Path:     "/",
			Expires:  refresh6AM,
			MaxAge:   int(time.Until(refresh6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: false,
			SameSite: sameSiteMode,
		},
	}

	// Call Go Main API internal endpoint to get saas-api tokens
	saasAccess, saasRefresh := fetchSaasTokens(email)
	if saasAccess != "" {
		cookies = append(cookies, &http.Cookie{
			Name:     "saas_access_token",
			Value:    saasAccess,
			Path:     "/",
			Expires:  next6AM,
			MaxAge:   int(time.Until(next6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: false, // needs to be readable by JS to sync to localStorage
			SameSite: sameSiteMode,
		})
	}
	if saasRefresh != "" {
		cookies = append(cookies, &http.Cookie{
			Name:     "saas_refresh_token",
			Value:    saasRefresh,
			Path:     "/",
			Expires:  refresh6AM,
			MaxAge:   int(time.Until(refresh6AM).Seconds()),
			Secure:   useHTTPS,
			HttpOnly: false,
			SameSite: sameSiteMode,
		})
	}

	for _, c := range cookies {
		http.SetCookie(w, c)
	}

	log.Printf("EmbedHandler: Set %d cookies for %s, redirecting to %s", len(cookies), email, redirectPath)

	saasOK := "false"
	if saasAccess != "" {
		saasOK = "true"
	}
	fylogger.InfoLog(r.Context(), "embed_success", auditFields(map[string]string{
		"email":         email,
		"mongo_user_id": mongoUserID,
		"redirect_path": redirectPath,
		"saas_tokens":   saasOK,
		"cookie_count":  fmt.Sprintf("%d", len(cookies)),
		"http_status":   "302",
	}))

	http.Redirect(w, r, redirectPath, http.StatusFound)
}

// fetchSaasTokens calls the Go Main API's internal endpoint to get saas-api tokens.
// Returns (accessToken, refreshToken). On failure, returns empty strings.
func fetchSaasTokens(email string) (string, string) {
	reqBody := fmt.Sprintf(`{"email":"%s"}`, email)
	url := mainAPIURL + "/api/v1/auth/internal/login-by-email"

	resp, err := http.Post(url, "application/json", strings.NewReader(reqBody))
	if err != nil {
		log.Printf("EmbedHandler: Failed to call internal login API: %v", err)
		return "", ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("EmbedHandler: Failed to read internal login response: %v", err)
		return "", ""
	}

	if resp.StatusCode != 200 {
		log.Printf("EmbedHandler: Internal login API returned %d: %s", resp.StatusCode, string(body))
		return "", ""
	}

	var result struct {
		Data struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("EmbedHandler: Failed to parse internal login response: %v", err)
		return "", ""
	}

	log.Printf("EmbedHandler: Got saas-api tokens for %s", email)
	return result.Data.AccessToken, result.Data.RefreshToken
}

// verifyToken returns email from token or error
func verifyToken(tokenString string) (string, error) {
	tokenString = strings.TrimSpace(tokenString)
	if strings.HasPrefix(strings.ToLower(tokenString), "bearer ") {
		tokenString = tokenString[7:]
	}

	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return jwtSecret, nil
	})

	if err != nil {
		return "", err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		if email, ok := claims["email"].(string); ok {
			return email, nil
		}
	}

	return "", fmt.Errorf("invalid token")
}

// proxyWebsocket proxies a websocket connection to the target websocket endpoint.
func proxyWebsocket(w http.ResponseWriter, r *http.Request, targetUrl *url.URL, email string) {
	dialer := websocket.DefaultDialer

	requestHeader := http.Header{}
	for k, v := range r.Header {
		lowerK := strings.ToLower(k)
		if lowerK == "sec-websocket-key" ||
			lowerK == "sec-websocket-accept" ||
			lowerK == "sec-websocket-extensions" ||
			lowerK == "upgrade" ||
			lowerK == "connection" ||
			lowerK == "sec-websocket-version" ||
			lowerK == "sec-websocket-protocol" {
			continue
		}
		for _, vv := range v {
			requestHeader.Add(k, vv)
		}
	}

	if email != "" {
		requestHeader.Set("X-Authenticated-User", email)
		requestHeader.Set("X-User-From-Proxy", email)
	}

	wsScheme := "ws"
	if targetUrl.Scheme == "https" || targetUrl.Scheme == "wss" {
		wsScheme = "wss"
	}

	targetWsUrl := url.URL{
		Scheme:   wsScheme,
		Host:     targetUrl.Host,
		Path:     r.URL.Path, // pass through path after /proxy
		RawQuery: r.URL.RawQuery,
	}

	backendConn, resp, err := dialer.Dial(targetWsUrl.String(), requestHeader)
	if err != nil {
		log.Printf("websocket dial error: %v (resp: %+v)\n", err, resp)
		http.Error(w, "Error connecting to backend websocket: "+err.Error(), http.StatusBadGateway)
		return
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true }, // allow from any origin for demo; adjust in prod
	}

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v\n", err)
		backendConn.Close()
		return
	}

	errc := make(chan error, 2)

	go func() {
		defer backendConn.Close()
		defer clientConn.Close()
		for {
			mt, message, err := clientConn.ReadMessage()
			if err != nil {
				errc <- err
				return
			}
			if err := backendConn.WriteMessage(mt, message); err != nil {
				errc <- err
				return
			}
		}
	}()

	go func() {
		defer backendConn.Close()
		defer clientConn.Close()
		for {
			mt, message, err := backendConn.ReadMessage()
			if err != nil {
				errc <- err
				return
			}
			if err := clientConn.WriteMessage(mt, message); err != nil {
				errc <- err
				return
			}
		}
	}()

	<-errc
}

// stripPrefixPath removes the proxy prefix and returns the modified request path for backend.
func stripPrefixPath(r *http.Request, prefix string) {
	r.URL.Path = strings.TrimPrefix(r.URL.Path, prefix)
	if r.URL.Path == "" {
		r.URL.Path = "/"
	}
}

func main() {
	// Parse targets
	backendTarget, err := url.Parse(libreBackend)
	if err != nil {
		log.Fatal(err)
	}

	frontendTarget, err := url.Parse(libreFrontend)
	if err != nil {
		log.Fatal(err)
	}

	// Backend API proxy
	backendProxy := httputil.NewSingleHostReverseProxy(backendTarget)
	backendProxy.Transport = &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   300 * time.Second,
			KeepAlive: 300 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     false,
		MaxIdleConns:          100,
		IdleConnTimeout:       9000 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}

	originalBackendDirector := backendProxy.Director
	backendProxy.Director = func(req *http.Request) {
		originalBackendDirector(req)
		req.Host = backendTarget.Host

		authHeader := req.Header.Get("Authorization")
		if authHeader != "" {
			token := authHeader
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}

			// First, try to verify as LibreChat token (signed with LIBRE_JWT_SECRET)
			if len(libreJWTSecret) > 0 {
				if _, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
					if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
					}
					return libreJWTSecret, nil
				}); err == nil {
					goto forwardCookies
				}
			}

			var proxyToken string
			if c, err := req.Cookie(cookieName); err == nil {
				proxyToken = c.Value
			}
			if proxyToken == "" {
				proxyToken = token
			}

			email := ""
			if proxyToken != "" {
				if e, err := verifyToken(proxyToken); err == nil {
					email = e
				}
			}

			if email != "" {
				req.Header.Set("X-Authenticated-User", email)
				req.Header.Set("X-User-From-Proxy", email)
				req.Header.Del("Authorization")
			}
		} else {
			if c, err := req.Cookie(cookieName); err == nil {
				if email, err := verifyToken(c.Value); err == nil {
					req.Header.Set("X-Authenticated-User", email)
					req.Header.Set("X-User-From-Proxy", email)
				}
			}
		}

	forwardCookies:
		if strings.Contains(req.URL.Path, "/api/auth/refresh") {
			refreshTokenCookie, _ := req.Cookie("refreshToken")
			tokenProviderCookie, _ := req.Cookie("token_provider")
			cookieHeader := req.Header.Get("Cookie")

			if refreshTokenCookie != nil && !strings.Contains(cookieHeader, "refreshToken=") {
				if cookieHeader != "" {
					req.Header.Set("Cookie", cookieHeader+"; refreshToken="+refreshTokenCookie.Value)
				} else {
					req.Header.Set("Cookie", "refreshToken="+refreshTokenCookie.Value)
				}
				cookieHeader = req.Header.Get("Cookie")
			}

			if tokenProviderCookie != nil && !strings.Contains(cookieHeader, "token_provider=") {
				if cookieHeader != "" {
					req.Header.Set("Cookie", cookieHeader+"; token_provider="+tokenProviderCookie.Value)
				} else {
					req.Header.Set("Cookie", "token_provider="+tokenProviderCookie.Value)
				}
			}
		}
	}

	// Frontend proxy (for Vite dev server)
	frontendProxy := httputil.NewSingleHostReverseProxy(frontendTarget)
	frontendProxy.Transport = &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   300 * time.Second,
			KeepAlive: 300 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     false,
		MaxIdleConns:          100,
		IdleConnTimeout:       9000 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}

	originalFrontendDirector := frontendProxy.Director
	frontendProxy.Director = func(req *http.Request) {
		originalFrontendDirector(req)
		req.Host = frontendTarget.Host
	}

	// HTML from Vite may reference the dev frontend port; rewrite to this proxy (e.g. 7080) for local WS.
	frontendProxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("Access-Control-Allow-Origin", "*")
		resp.Header.Set("Access-Control-Allow-Credentials", "true")
		resp.Header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		resp.Header.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/html") {
			return nil
		}
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		_ = resp.Body.Close()

		htmlContent := string(bodyBytes)
		htmlContent = strings.ReplaceAll(htmlContent, `ws://localhost:3090/`, `ws://localhost:7080/`)
		htmlContent = strings.ReplaceAll(htmlContent, `wss://localhost:3090/`, `wss://localhost:7080/`)
		htmlContent = strings.ReplaceAll(htmlContent, `"ws://localhost:3090/`, `"ws://localhost:7080/`)
		htmlContent = strings.ReplaceAll(htmlContent, `"wss://localhost:3090/`, `"wss://localhost:7080/`)
		htmlContent = strings.ReplaceAll(htmlContent, `'ws://localhost:3090/`, `'ws://localhost:7080/`)
		htmlContent = strings.ReplaceAll(htmlContent, `'wss://localhost:3090/`, `'wss://localhost:7080/`)

		resp.Body = io.NopCloser(strings.NewReader(htmlContent))
		resp.ContentLength = int64(len(htmlContent))
		resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(htmlContent)))
		return nil
	}

	// Helper function to extract email from request
	extractEmailFromRequest := func(r *http.Request) string {
		var token string
		if c, err := r.Cookie(cookieName); err == nil {
			token = c.Value
		}
		if token == "" {
			token = r.Header.Get("Authorization")
		}
		if token != "" {
			if email, err := verifyToken(token); err == nil {
				return email
			}
		}
		return ""
	}
	saasAPITarget, err := url.Parse(mainAPIURL)
	if err != nil {
		log.Fatalf("Failed to parse saas-api URL: %v", err)
	}
	saasAPIProxy := httputil.NewSingleHostReverseProxy(saasAPITarget)
	saasAPIProxy.Transport = &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   300 * time.Second,
			KeepAlive: 300 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     false,
		MaxIdleConns:          100,
		IdleConnTimeout:       9000 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}
	saasAPIProxy.Director = func(req *http.Request) {
		req.URL.Scheme = saasAPITarget.Scheme
		req.URL.Host = saasAPITarget.Host
		req.Host = saasAPITarget.Host
	}
	// Add error handler to catch and log proxy errors
	saasAPIProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("ERROR: saasAPIProxy error for %s %s: %v", r.Method, r.URL.Path, err)
		fylogger.ErrorLog(r.Context(), "saas_proxy_error", err, map[string]interface{}{
			"service": "insti-proxy",
			"method":  r.Method,
			"path":    r.URL.Path,
		})
		http.Error(w, fmt.Sprintf("Bad Gateway: %v", err), http.StatusBadGateway)
	}

	// Parent app opens this URL (top-level) with FYERS token; sets LibreChat + Nucleus cookies, then redirects into the iframe.
	http.HandleFunc(basePath+"/auth/embed", embedHandler)

	http.HandleFunc(basePath+"/static/", func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, r)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		stripPrefixPath(r, basePath)
		saasAPIProxy.ServeHTTP(w, r)
	})

	// Backend API routes (basePath/api and basePath/oauth)
	http.HandleFunc(basePath+"/api/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, basePath+"/api/v1/") {
			setCORSHeaders(w, r)
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			stripPrefixPath(r, basePath)
			saasAPIProxy.ServeHTTP(w, r)
			return
		}

		stripPrefixPath(r, basePath)
		email := extractEmailFromRequest(r)
		if strings.EqualFold(r.Header.Get("Connection"), "Upgrade") || strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			proxyWebsocket(w, r, backendTarget, email)
			return
		}

		backendProxy.ServeHTTP(w, r)
	})

	http.HandleFunc(basePath+"/oauth/", func(w http.ResponseWriter, r *http.Request) {
		stripPrefixPath(r, basePath)
		backendProxy.ServeHTTP(w, r)
	})

	// basePath/ handler - frontend and catch-all
	http.HandleFunc(basePath+"/", func(w http.ResponseWriter, r *http.Request) {
		// Don't handle routes that have more specific handlers (must still reach a handler below).
		// basePath/assets/ is served by the LibreChat frontend (Vite/static); do not return early
		// without proxying — that produced empty 200 responses and broken images.
		if strings.HasPrefix(r.URL.Path, basePath+"/api/") ||
			strings.HasPrefix(r.URL.Path, basePath+"/oauth/") ||
			strings.HasPrefix(r.URL.Path, basePath+"/static/") {
			return
		}

		// Frontend is configured with base: basePath, so keep the prefix
		email := extractEmailFromRequest(r)
		if strings.EqualFold(r.Header.Get("Connection"), "Upgrade") ||
			strings.EqualFold(r.Header.Get("Upgrade"), "websocket") ||
			(r.URL.Query().Get("token") != "" && r.Method == "GET") {
			if strings.EqualFold(r.Header.Get("Connection"), "Upgrade") ||
				strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
				proxyWebsocket(w, r, frontendTarget, email)
				return
			}
			if r.URL.Query().Get("token") != "" {
				proxyWebsocket(w, r, frontendTarget, email)
				return
			}
		}

		frontendProxy.ServeHTTP(w, r)
	})

	// Redirect legacy /assets/ and /api/ paths to basePath equivalents
	http.HandleFunc("/assets/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, basePath+r.URL.Path+"?"+r.URL.RawQuery, http.StatusMovedPermanently)
	})
	http.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, basePath+r.URL.Path+"?"+r.URL.RawQuery, http.StatusMovedPermanently)
	})

	// Redirect root to basePath/
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, basePath+"/", http.StatusMovedPermanently)
			return
		}
		http.NotFound(w, r)
	})

	port := "7080" // Default port
	if p := os.Getenv("PROXY_PORT"); p != "" {
		port = p
	}

	// For development, use HTTP. For production, use HTTPS with certs
	// Check USE_HTTPS environment variable
	useHTTPSEnv := os.Getenv("USE_HTTPS")
	if useHTTPSEnv == "false" {
		// Explicitly set to false - use HTTP mode (development)
		useHTTPS = false
		log.Println("USE_HTTPS=false - Development mode: Cookies will have Secure=false")
		log.Println("This is only suitable for HTTP (localhost) access")
	} else if useHTTPSEnv == "true" {
		// Explicitly set to true - use HTTPS mode (production)
		useHTTPS = true
		log.Println("USE_HTTPS=true - Production mode: Cookies will have Secure=true")
	} else {
		// Not set - default to true for safety (production-ready)
		useHTTPS = true
		log.Println("USE_HTTPS not set, defaulting to 'true' for production safety")
		log.Println("Cookies will have Secure=true and work with HTTPS")
		log.Println("Set USE_HTTPS=false explicitly for local HTTP development")
	}

	// Server HTTPS: SERVER_HTTPS controls whether the proxy server itself runs HTTPS
	// Set to "true" only if you want the proxy to handle TLS (needs cert.pem/key.pem)
	// If behind a reverse proxy (nginx/Apache), leave this false
	serverHTTPSEnv := os.Getenv("SERVER_HTTPS")
	serverHTTPS = serverHTTPSEnv == "true"

	if serverHTTPS {
		log.Println("SERVER_HTTPS=true - Server will run with TLS (requires cert.pem and key.pem)")
	} else {
		log.Println("SERVER_HTTPS not set or false - Server will run on HTTP")
		log.Println("(Recommended when behind reverse proxy like nginx)")
	}

	srv := &http.Server{
		Addr: ":" + port,
		// Good practice: set timeouts to avoid Slowloris
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 300 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	if serverHTTPS {
		certFile := "cert.pem"
		keyFile := "key.pem"
		srv.TLSConfig = &tls.Config{
			MinVersion:               tls.VersionTLS12,
			PreferServerCipherSuites: true,
		}

		if _, err := os.Stat(certFile); os.IsNotExist(err) {
			log.Fatalf("cert.pem not found in current directory; please create or place cert.pem and key.pem alongside the server binary")
		}

		// Graceful shutdown
		go func() {
			log.Printf("Starting HTTPS proxy server on https://localhost:%s\n", port)
			log.Printf("Backend proxy: %s\n", libreBackend)
			log.Printf("Frontend proxy: %s\n", libreFrontend)
			if err := srv.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
				log.Fatalf("ListenAndServeTLS(): %v", err)
			}
		}()
	} else {
		// Graceful shutdown
		go func() {
			log.Printf("Starting HTTP proxy server on http://localhost:%s\n", port)
			log.Printf("Backend proxy: %s\n", libreBackend)
			log.Printf("Frontend proxy: %s\n", libreFrontend)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("ListenAndServe(): %v", err)
			}
		}()
	}

	// handle shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
