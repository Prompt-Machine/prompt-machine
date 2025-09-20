// ========================================
// USER MANAGEMENT SERVICE
// Complete user lifecycle management
// ========================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Email transporter setup
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

class UserService {
    /**
     * Create a new user with profile
     */
    async createUser(userData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Hash password
            const passwordHash = await bcrypt.hash(userData.password, 12);
            
            // Generate verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');

            // Create user
            const userQuery = `
                INSERT INTO users_extended (
                    email, username, password_hash, full_name,
                    company, job_title, phone, timezone,
                    language, email_verification_token,
                    role, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, email, username, full_name, role, status
            `;

            const result = await client.query(userQuery, [
                userData.email.toLowerCase(),
                userData.username || userData.email.split('@')[0],
                passwordHash,
                userData.fullName,
                userData.company,
                userData.jobTitle,
                userData.phone,
                userData.timezone || 'UTC',
                userData.language || 'en',
                verificationToken,
                userData.role || 'user',
                'active'
            ]);

            const user = result.rows[0];

            // Send verification email
            await this.sendVerificationEmail(user.email, verificationToken);

            // Create audit log
            await this.logAuditEvent(client, {
                userId: user.id,
                action: 'USER_CREATED',
                resourceType: 'user',
                resourceId: user.id,
                success: true
            });

            await client.query('COMMIT');
            return user;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user by ID with full profile
     */
    async getUserById(userId) {
        const query = `
            SELECT 
                u.*,
                s.plan_id,
                sp.name as plan_name,
                sp.features as plan_features,
                c.company_name as client_company,
                c.id as client_id,
                COUNT(DISTINCT p.id) as tools_created,
                COUNT(DISTINCT td.id) as tools_deployed
            FROM users_extended u
            LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            LEFT JOIN client_team_members ctm ON u.id = ctm.user_id
            LEFT JOIN clients c ON ctm.client_id = c.id
            LEFT JOIN projects_v6 p ON u.id = p.user_id
            LEFT JOIN tool_deployments td ON p.id = td.project_id
            WHERE u.id = $1
            GROUP BY u.id, s.plan_id, sp.name, sp.features, c.company_name, c.id
        `;

        const result = await pool.query(query, [userId]);
        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        return result.rows[0];
    }

    /**
     * Update user profile
     */
    async updateUser(userId, updates) {
        const allowedUpdates = [
            'full_name', 'username', 'bio', 'company', 
            'job_title', 'phone', 'timezone', 'language',
            'avatar_url', 'preferences'
        ];

        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                updateFields.push(`${key} = $${paramCount}`);
                updateValues.push(value);
                paramCount++;
            }
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        updateValues.push(userId);
        const query = `
            UPDATE users_extended 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, updateValues);
        return result.rows[0];
    }

    /**
     * Change user password
     */
    async changePassword(userId, currentPassword, newPassword) {
        const client = await pool.connect();
        try {
            // Get current password hash
            const userResult = await client.query(
                'SELECT password_hash FROM users_extended WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            // Verify current password
            const validPassword = await bcrypt.compare(
                currentPassword,
                userResult.rows[0].password_hash
            );

            if (!validPassword) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            const newPasswordHash = await bcrypt.hash(newPassword, 12);

            // Update password
            await client.query(
                'UPDATE users_extended SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newPasswordHash, userId]
            );

            // Log audit event
            await this.logAuditEvent(client, {
                userId,
                action: 'PASSWORD_CHANGED',
                resourceType: 'user',
                resourceId: userId,
                success: true
            });

            return { success: true };

        } finally {
            client.release();
        }
    }

    /**
     * Enable two-factor authentication
     */
    async enableTwoFactor(userId) {
        const secret = crypto.randomBytes(32).toString('hex');
        
        await pool.query(
            `UPDATE users_extended 
             SET two_factor_enabled = true, 
                 two_factor_secret = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [secret, userId]
        );

        return { secret };
    }

    /**
     * Search users with filters
     */
    async searchUsers(filters = {}) {
        let query = `
            SELECT 
                u.id, u.email, u.username, u.full_name,
                u.company, u.role, u.status, u.created_at,
                u.last_login_at, c.company_name as client_name
            FROM users_extended u
            LEFT JOIN client_team_members ctm ON u.id = ctm.user_id
            LEFT JOIN clients c ON ctm.client_id = c.id
            WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (filters.search) {
            query += ` AND (
                u.email ILIKE $${paramCount} OR 
                u.username ILIKE $${paramCount} OR 
                u.full_name ILIKE $${paramCount}
            )`;
            params.push(`%${filters.search}%`);
            paramCount++;
        }

        if (filters.role) {
            query += ` AND u.role = $${paramCount}`;
            params.push(filters.role);
            paramCount++;
        }

        if (filters.status) {
            query += ` AND u.status = $${paramCount}`;
            params.push(filters.status);
            paramCount++;
        }

        if (filters.clientId) {
            query += ` AND c.id = $${paramCount}`;
            params.push(filters.clientId);
            paramCount++;
        }

        // Add sorting
        const sortColumn = filters.sortBy || 'created_at';
        const sortOrder = filters.sortOrder || 'DESC';
        query += ` ORDER BY u.${sortColumn} ${sortOrder}`;

        // Add pagination
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        query += ` LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Get user statistics
     */
    async getUserStats(userId) {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM projects_v6 WHERE user_id = $1) as total_tools,
                (SELECT COUNT(*) FROM tool_deployments td 
                 JOIN projects_v6 p ON td.project_id = p.id 
                 WHERE p.user_id = $1) as deployed_tools,
                (SELECT COUNT(*) FROM analytics_events WHERE user_id = $1) as total_events,
                (SELECT SUM(revenue) FROM tool_marketplace tm
                 JOIN projects_v6 p ON tm.project_id = p.id
                 WHERE p.user_id = $1) as total_revenue,
                (SELECT COUNT(DISTINCT session_id) FROM analytics_sessions 
                 WHERE user_id = $1) as total_sessions,
                (SELECT COUNT(*) FROM tool_collaborators tc
                 JOIN projects_v6 p ON tc.project_id = p.id
                 WHERE p.user_id = $1) as collaborations
        `;

        const result = await pool.query(query, [userId]);
        return result.rows[0];
    }

    /**
     * Suspend or activate user account
     */
    async updateUserStatus(userId, status, reason = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update user status
            await client.query(
                'UPDATE users_extended SET status = $1, updated_at = NOW() WHERE id = $2',
                [status, userId]
            );

            // If suspending, also deactivate sessions
            if (status === 'suspended') {
                await client.query(
                    'DELETE FROM sessions WHERE user_id = $1',
                    [userId]
                );
            }

            // Log audit event
            await this.logAuditEvent(client, {
                userId,
                action: `USER_${status.toUpperCase()}`,
                resourceType: 'user',
                resourceId: userId,
                newValues: { status, reason },
                success: true
            });

            await client.query('COMMIT');
            return { success: true };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete user account (soft delete)
     */
    async deleteUser(userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Anonymize user data
            const anonymizedEmail = `deleted_${userId}@deleted.com`;
            await client.query(
                `UPDATE users_extended 
                 SET email = $1, 
                     username = $2,
                     full_name = 'Deleted User',
                     password_hash = '',
                     status = 'deleted',
                     updated_at = NOW()
                 WHERE id = $3`,
                [anonymizedEmail, `deleted_${userId}`, userId]
            );

            // Delete sessions
            await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

            // Delete API keys
            await client.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);

            // Log audit event
            await this.logAuditEvent(client, {
                userId,
                action: 'USER_DELETED',
                resourceType: 'user',
                resourceId: userId,
                success: true
            });

            await client.query('COMMIT');
            return { success: true };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user permissions
     */
    async getUserPermissions(userId) {
        const query = `
            SELECT 
                u.role,
                u.permissions as user_permissions,
                c.feature_flags as client_features,
                sp.features as plan_features,
                sp.limits as plan_limits
            FROM users_extended u
            LEFT JOIN client_team_members ctm ON u.id = ctm.user_id
            LEFT JOIN clients c ON ctm.client_id = c.id
            LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE u.id = $1
        `;

        const result = await pool.query(query, [userId]);
        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        const data = result.rows[0];
        
        // Combine all permissions
        const permissions = {
            role: data.role,
            userPermissions: data.user_permissions || [],
            clientFeatures: data.client_features || [],
            planFeatures: data.plan_features || [],
            planLimits: data.plan_limits || {}
        };

        return permissions;
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(email, token) {
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
        
        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@prompt-machine.ca',
            to: email,
            subject: 'Verify your Prompt Machine account',
            html: `
                <h2>Welcome to Prompt Machine!</h2>
                <p>Please verify your email address by clicking the link below:</p>
                <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
                    Verify Email
                </a>
                <p>Or copy this link: ${verificationUrl}</p>
                <p>This link will expire in 24 hours.</p>
            `
        };

        await emailTransporter.sendMail(mailOptions);
    }

    /**
     * Verify email with token
     */
    async verifyEmail(token) {
        const result = await pool.query(
            `UPDATE users_extended 
             SET email_verified = true, 
                 email_verification_token = NULL,
                 updated_at = NOW()
             WHERE email_verification_token = $1
             RETURNING id, email`,
            [token]
        );

        if (result.rows.length === 0) {
            throw new Error('Invalid verification token');
        }

        return result.rows[0];
    }

    /**
     * Request password reset
     */
    async requestPasswordReset(email) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        const result = await pool.query(
            `UPDATE users_extended 
             SET password_reset_token = $1,
                 password_reset_expires = $2,
                 updated_at = NOW()
             WHERE email = $3
             RETURNING id`,
            [resetToken, expiresAt, email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            // Don't reveal if email exists
            return { success: true };
        }

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@prompt-machine.ca',
            to: email,
            subject: 'Reset your Prompt Machine password',
            html: `
                <h2>Password Reset Request</h2>
                <p>Click the link below to reset your password:</p>
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
                    Reset Password
                </a>
                <p>Or copy this link: ${resetUrl}</p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            `
        };

        await emailTransporter.sendMail(mailOptions);
        return { success: true };
    }

    /**
     * Reset password with token
     */
    async resetPassword(token, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, 12);

        const result = await pool.query(
            `UPDATE users_extended 
             SET password_hash = $1,
                 password_reset_token = NULL,
                 password_reset_expires = NULL,
                 updated_at = NOW()
             WHERE password_reset_token = $2 
                   AND password_reset_expires > NOW()
             RETURNING id, email`,
            [passwordHash, token]
        );

        if (result.rows.length === 0) {
            throw new Error('Invalid or expired reset token');
        }

        return result.rows[0];
    }

    /**
     * Log audit event
     */
    async logAuditEvent(client, event) {
        await client.query(
            `INSERT INTO audit_logs 
             (user_id, action, resource_type, resource_id, 
              old_values, new_values, success, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                event.userId,
                event.action,
                event.resourceType,
                event.resourceId,
                event.oldValues || null,
                event.newValues || null,
                event.success,
                event.errorMessage || null
            ]
        );
    }
}

module.exports = new UserService();
