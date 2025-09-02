const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();

// Database connection (using same config as main app)
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }

        // Find user in database
        const result = await pool.query(
            'SELECT id, email, password_hash FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }

        const user = result.rows[0];

        // Compare password with hash
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return success response
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// GET /api/auth/me - Get current user info
router.get('/me', async (req, res) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authorization token required' 
            });
        }

        const token = authHeader.substring(7);
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const result = await pool.query(
            'SELECT id, email, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'User not found' 
            });
        }

        res.json({
            user: result.rows[0]
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Invalid token' 
            });
        }
        
        console.error('Get user error:', error);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// POST /api/auth/logout (simple version - just invalidate on client)
router.post('/logout', (req, res) => {
    // In a simple JWT implementation, logout is handled client-side
    // by removing the token from localStorage
    res.json({ 
        message: 'Logged out successfully' 
    });
});

module.exports = router;