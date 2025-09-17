const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { 
            email, 
            password, 
            firstName, 
            lastName, 
            confirmPassword 
        } = req.body;

        // Validate input
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ 
                success: false,
                error: 'Email, password, first name, and last name are required' 
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ 
                success: false,
                error: 'Passwords do not match' 
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ 
                success: false,
                error: 'Password must be at least 8 characters long' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format' 
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                success: false,
                error: 'User with this email already exists' 
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user
        const result = await pool.query(`
            INSERT INTO users (
                email, 
                password_hash, 
                first_name, 
                last_name, 
                registration_token, 
                account_status,
                is_verified
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id, email, first_name, last_name, created_at
        `, [
            email.toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            verificationToken,
            'active', // Start as active for now, can add email verification later
            true // Auto-verify for now
        ]);

        const newUser = result.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: newUser.id, 
                email: newUser.email 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return success response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                email: newUser.email,
                firstName: newUser.first_name,
                lastName: newUser.last_name,
                createdAt: newUser.created_at
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
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

        // Get user details for response
        const userDetails = await pool.query(
            'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
            [user.id]
        );

        const userInfo = userDetails.rows[0];

        // Return success response
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: userInfo.id,
                email: userInfo.email,
                firstName: userInfo.first_name,
                lastName: userInfo.last_name,
                createdAt: userInfo.created_at
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

// PUT /api/auth/profile - Update user profile
router.put('/profile', async (req, res) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization token required' 
            });
        }

        const token = authHeader.substring(7);
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { firstName, lastName } = req.body;

        // Validate input
        if (!firstName || !lastName) {
            return res.status(400).json({ 
                success: false,
                error: 'First name and last name are required' 
            });
        }

        // Update user profile
        const result = await pool.query(
            'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, first_name, last_name',
            [firstName.trim(), lastName.trim(), decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        console.error('Update profile error:', error);
        res.status(500).json({ 
            success: false,
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