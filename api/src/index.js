require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
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

// CORS configuration
const corsOptions = {
    origin: [
        'https://app.prompt-machine.com',
        'http://localhost:3000'  // for development
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
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

// Start server
app.listen(PORT, () => {
    console.log(`✅ MVP API running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
});
