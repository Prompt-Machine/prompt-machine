// Update for api/src/index.js to handle CORS properly with HTTPS domains

require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('✅ Database connected:', res.rows[0].now);
    }
});

// CORS configuration for HTTPS
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://app.prompt-machine.com',
            'https://prompt-machine.com',
            'http://localhost:3000', // For local development
            'http://localhost:3001'
        ];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Check if it's a tool subdomain
        if (origin.match(/^https?:\/\/[a-z0-9-]+\.tool\.prompt-machine\.com$/)) {
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Basic routes
app.get('/', (req, res) => {
    res.json({
        name: 'Prompt Machine MVP API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            auth: '/api/auth/login',
            projects: '/api/projects'
        }
    });
});

// API routes will go here
app.use('/api/auth', require('./routes/auth')); // You'll create this
app.use('/api/projects', require('./routes/projects')); // You'll create this

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ MVP API running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`🌐 API URL: ${process.env.API_URL || 'https://api.prompt-machine.com'}`);
});

module.exports = app;