// ========================================
// CLIENT MANAGEMENT SERVICE
// B2B client and workspace management
// ========================================

const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

class ClientService {
    /**
     * Create new client organization
     */
    async createClient(clientData, createdBy) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create client record
            const clientQuery = `
                INSERT INTO clients (
                    company_name, domain, logo_url,
                    primary_contact_id, billing_email, billing_address,
                    tax_id, industry, company_size,
                    subscription_tier, contract_start, contract_end,
                    custom_branding, feature_flags,
                    api_quota, storage_quota_gb, seats_limit,
                    status, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING *
            `;

            const result = await client.query(clientQuery, [
                clientData.companyName,
                clientData.domain,
                clientData.logoUrl,
                clientData.primaryContactId || createdBy,
                clientData.billingEmail,
                JSON.stringify(clientData.billingAddress || {}),
                clientData.taxId,
                clientData.industry,
                clientData.companySize,
                clientData.subscriptionTier || 'free',
                clientData.contractStart || new Date(),
                clientData.contractEnd,
                JSON.stringify(clientData.customBranding || {}),
                JSON.stringify(clientData.featureFlags || []),
                clientData.apiQuota || 1000,
                clientData.storageQuotaGb || 10,
                clientData.seatsLimit || 5,
                'active',
                clientData.notes
            ]);

            const newClient = result.rows[0];

            // Add primary contact as team member
            if (clientData.primaryContactId) {
                await this.addTeamMember(
                    client,
                    newClient.id,
                    clientData.primaryContactId,
                    'owner',
                    createdBy
                );
            }

            // Create default workspace settings
            await this.createWorkspaceSettings(client, newClient.id);

            // Log audit event
            await this.logAuditEvent(client, {
                userId: createdBy,
                action: 'CLIENT_CREATED',
                resourceType: 'client',
                resourceId: newClient.id,
                newValues: clientData,
                success: true
            });

            await client.query('COMMIT');
            return newClient;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update client information
     */
    async updateClient(clientId, updates, updatedBy) {
        const allowedUpdates = [
            'company_name', 'domain', 'logo_url',
            'billing_email', 'billing_address', 'tax_id',
            'industry', 'company_size', 'custom_branding',
            'feature_flags', 'api_quota', 'storage_quota_gb',
            'seats_limit', 'notes'
        ];

        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                updateFields.push(`${key} = $${paramCount}`);
                updateValues.push(
                    ['billing_address', 'custom_branding', 'feature_flags'].includes(key)
                        ? JSON.stringify(value)
                        : value
                );
                paramCount++;
            }
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        updateValues.push(clientId);
        const query = `
            UPDATE clients 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(query, updateValues);
        return result.rows[0];
    }

    /**
     * Get client by ID with full details
     */
    async getClient(clientId) {
        const query = `
            SELECT 
                c.*,
                COUNT(DISTINCT ctm.user_id) as team_members_count,
                COUNT(DISTINCT p.id) as tools_count,
                s.plan_id,
                sp.name as plan_name,
                sp.price_monthly,
                sp.price_yearly,
                COALESCE(SUM(i.total), 0) as total_spent
            FROM clients c
            LEFT JOIN client_team_members ctm ON c.id = ctm.client_id
            LEFT JOIN projects_v6 p ON p.client_id = c.id
            LEFT JOIN subscriptions s ON c.id = s.client_id AND s.status = 'active'
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            LEFT JOIN invoices i ON s.id = i.subscription_id AND i.status = 'paid'
            WHERE c.id = $1
            GROUP BY c.id, s.plan_id, sp.name, sp.price_monthly, sp.price_yearly
        `;

        const result = await pool.query(query, [clientId]);
        if (result.rows.length === 0) {
            throw new Error('Client not found');
        }

        // Get team members
        const teamMembers = await this.getTeamMembers(clientId);

        return {
            ...result.rows[0],
            teamMembers
        };
    }

    /**
     * List all clients with filters
     */
    async listClients(filters = {}) {
        let query = `
            SELECT 
                c.*,
                COUNT(DISTINCT ctm.user_id) as team_members_count,
                COUNT(DISTINCT p.id) as tools_count,
                sp.name as plan_name
            FROM clients c
            LEFT JOIN client_team_members ctm ON c.id = ctm.client_id
            LEFT JOIN projects_v6 p ON p.client_id = c.id
            LEFT JOIN subscriptions s ON c.id = s.client_id AND s.status = 'active'
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (filters.status) {
            query += ` AND c.status = $${paramCount}`;
            params.push(filters.status);
            paramCount++;
        }

        if (filters.subscriptionTier) {
            query += ` AND c.subscription_tier = $${paramCount}`;
            params.push(filters.subscriptionTier);
            paramCount++;
        }

        if (filters.industry) {
            query += ` AND c.industry = $${paramCount}`;
            params.push(filters.industry);
            paramCount++;
        }

        if (filters.search) {
            query += ` AND (c.company_name ILIKE $${paramCount} OR c.domain ILIKE $${paramCount})`;
            params.push(`%${filters.search}%`);
            paramCount++;
        }

        query += ` GROUP BY c.id, sp.name`;

        // Add sorting
        const sortColumn = filters.sortBy || 'created_at';
        const sortOrder = filters.sortOrder || 'DESC';
        query += ` ORDER BY c.${sortColumn} ${sortOrder}`;

        // Add pagination
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        query += ` LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Add team member to client
     */
    async addTeamMember(dbClient, clientId, userId, role = 'member', invitedBy) {
        const query = `
            INSERT INTO client_team_members (
                client_id, user_id, role, permissions, invited_by
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (client_id, user_id) 
            DO UPDATE SET role = $3, permissions = $4
            RETURNING *
        `;

        const defaultPermissions = this.getDefaultPermissions(role);
        
        const result = await (dbClient || pool).query(query, [
            clientId,
            userId,
            role,
            JSON.stringify(defaultPermissions),
            invitedBy
        ]);

        return result.rows[0];
    }

    /**
     * Remove team member
     */
    async removeTeamMember(clientId, userId, removedBy) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check if user is the owner
            const ownerCheck = await client.query(
                'SELECT role FROM client_team_members WHERE client_id = $1 AND user_id = $2',
                [clientId, userId]
            );

            if (ownerCheck.rows[0]?.role === 'owner') {
                throw new Error('Cannot remove client owner');
            }

            // Remove team member
            await client.query(
                'DELETE FROM client_team_members WHERE client_id = $1 AND user_id = $2',
                [clientId, userId]
            );

            // Log audit event
            await this.logAuditEvent(client, {
                userId: removedBy,
                action: 'TEAM_MEMBER_REMOVED',
                resourceType: 'client_team',
                resourceId: clientId,
                oldValues: { userId },
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
     * Get team members for client
     */
    async getTeamMembers(clientId) {
        const query = `
            SELECT 
                ctm.*,
                u.email,
                u.full_name,
                u.avatar_url,
                u.last_login_at,
                COUNT(p.id) as tools_created
            FROM client_team_members ctm
            JOIN users_extended u ON ctm.user_id = u.id
            LEFT JOIN projects_v6 p ON u.id = p.user_id AND p.client_id = $1
            WHERE ctm.client_id = $1
            GROUP BY ctm.id, ctm.client_id, ctm.user_id, ctm.role, 
                     ctm.permissions, ctm.invited_by, ctm.invited_at, 
                     ctm.accepted_at, u.email, u.full_name, u.avatar_url, 
                     u.last_login_at
            ORDER BY 
                CASE ctm.role 
                    WHEN 'owner' THEN 1 
                    WHEN 'admin' THEN 2 
                    WHEN 'member' THEN 3 
                    ELSE 4 
                END
        `;

        const result = await pool.query(query, [clientId]);
        return result.rows;
    }

    /**
     * Update team member role
     */
    async updateTeamMemberRole(clientId, userId, newRole, updatedBy) {
        const permissions = this.getDefaultPermissions(newRole);
        
        const query = `
            UPDATE client_team_members 
            SET role = $1, permissions = $2
            WHERE client_id = $3 AND user_id = $4
            RETURNING *
        `;

        const result = await pool.query(query, [
            newRole,
            JSON.stringify(permissions),
            clientId,
            userId
        ]);

        return result.rows[0];
    }

    /**
     * Create workspace settings
     */
    async createWorkspaceSettings(dbClient, clientId) {
        // This would create default workspace configuration
        // For now, we'll store in the custom_branding field
        const defaultSettings = {
            theme: 'default',
            primaryColor: '#4F46E5',
            logo: null,
            customCSS: '',
            features: {
                toolCreation: true,
                analytics: true,
                collaboration: true,
                marketplace: false,
                customDomains: false
            }
        };

        await (dbClient || pool).query(
            'UPDATE clients SET custom_branding = $1 WHERE id = $2',
            [JSON.stringify(defaultSettings), clientId]
        );

        return defaultSettings;
    }

    /**
     * Get client statistics
     */
    async getClientStats(clientId) {
        const query = `
            SELECT 
                -- Team stats
                (SELECT COUNT(*) FROM client_team_members WHERE client_id = $1) as total_members,
                
                -- Tool stats
                (SELECT COUNT(*) FROM projects_v6 WHERE client_id = $1) as total_tools,
                (SELECT COUNT(*) FROM projects_v6 WHERE client_id = $1 AND deployed = true) as deployed_tools,
                
                -- Usage stats
                (SELECT COUNT(*) FROM analytics_events ae 
                 JOIN projects_v6 p ON ae.project_id = p.id 
                 WHERE p.client_id = $1) as total_events,
                
                (SELECT COUNT(DISTINCT ae.user_id) FROM analytics_events ae 
                 JOIN projects_v6 p ON ae.project_id = p.id 
                 WHERE p.client_id = $1) as unique_users,
                
                -- Storage stats
                (SELECT COALESCE(SUM(file_size_bytes), 0) FROM reports_generated 
                 WHERE client_id = $1) as storage_used_bytes,
                
                -- API usage
                (SELECT COUNT(*) FROM analytics_events 
                 WHERE event_type = 'api_call' 
                 AND user_id IN (
                     SELECT user_id FROM client_team_members WHERE client_id = $1
                 ) AND created_at >= DATE_TRUNC('month', CURRENT_DATE)) as api_calls_this_month,
                
                -- Revenue
                (SELECT COALESCE(SUM(i.total), 0) FROM invoices i
                 JOIN subscriptions s ON i.subscription_id = s.id
                 WHERE s.client_id = $1 AND i.status = 'paid') as total_revenue
        `;

        const result = await pool.query(query, [clientId]);
        return result.rows[0];
    }

    /**
     * Check client limits
     */
    async checkClientLimits(clientId, limitType) {
        const client = await pool.query(
            'SELECT api_quota, storage_quota_gb, seats_limit FROM clients WHERE id = $1',
            [clientId]
        );

        if (client.rows.length === 0) {
            throw new Error('Client not found');
        }

        const limits = client.rows[0];
        let currentUsage = 0;
        let limit = 0;

        switch (limitType) {
            case 'api_calls':
                limit = limits.api_quota;
                const apiResult = await pool.query(
                    `SELECT COUNT(*) as count FROM analytics_events 
                     WHERE event_type = 'api_call' 
                     AND user_id IN (
                         SELECT user_id FROM client_team_members WHERE client_id = $1
                     ) AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
                    [clientId]
                );
                currentUsage = parseInt(apiResult.rows[0].count);
                break;

            case 'storage':
                limit = limits.storage_quota_gb * 1024 * 1024 * 1024; // Convert to bytes
                const storageResult = await pool.query(
                    'SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM reports_generated WHERE client_id = $1',
                    [clientId]
                );
                currentUsage = parseInt(storageResult.rows[0].total);
                break;

            case 'seats':
                limit = limits.seats_limit;
                const seatsResult = await pool.query(
                    'SELECT COUNT(*) as count FROM client_team_members WHERE client_id = $1',
                    [clientId]
                );
                currentUsage = parseInt(seatsResult.rows[0].count);
                break;
        }

        return {
            allowed: currentUsage < limit,
            currentUsage,
            limit,
            remaining: Math.max(0, limit - currentUsage),
            percentUsed: limit > 0 ? (currentUsage / limit * 100).toFixed(2) : 0
        };
    }

    /**
     * Transfer client ownership
     */
    async transferOwnership(clientId, newOwnerId, currentOwnerId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update current owner to admin
            await client.query(
                `UPDATE client_team_members 
                 SET role = 'admin' 
                 WHERE client_id = $1 AND user_id = $2`,
                [clientId, currentOwnerId]
            );

            // Update new owner
            await client.query(
                `UPDATE client_team_members 
                 SET role = 'owner' 
                 WHERE client_id = $1 AND user_id = $2`,
                [clientId, newOwnerId]
            );

            // Update primary contact
            await client.query(
                'UPDATE clients SET primary_contact_id = $1 WHERE id = $2',
                [newOwnerId, clientId]
            );

            // Log audit event
            await this.logAuditEvent(client, {
                userId: currentOwnerId,
                action: 'OWNERSHIP_TRANSFERRED',
                resourceType: 'client',
                resourceId: clientId,
                oldValues: { owner: currentOwnerId },
                newValues: { owner: newOwnerId },
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
     * Suspend or activate client
     */
    async updateClientStatus(clientId, status, reason, updatedBy) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update client status
            await client.query(
                'UPDATE clients SET status = $1, updated_at = NOW() WHERE id = $2',
                [status, clientId]
            );

            // If suspending, disable all team member access
            if (status === 'suspended') {
                // You might want to revoke sessions, API keys, etc.
            }

            // Log audit event
            await this.logAuditEvent(client, {
                userId: updatedBy,
                action: `CLIENT_${status.toUpperCase()}`,
                resourceType: 'client',
                resourceId: clientId,
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
     * Get default permissions for role
     */
    getDefaultPermissions(role) {
        const permissions = {
            owner: [
                'manage_team', 'manage_billing', 'manage_tools',
                'view_analytics', 'manage_settings', 'delete_client'
            ],
            admin: [
                'manage_team', 'manage_tools', 'view_analytics',
                'manage_settings', 'view_billing'
            ],
            member: [
                'create_tools', 'edit_own_tools', 'view_analytics'
            ],
            viewer: [
                'view_tools', 'view_analytics'
            ]
        };

        return permissions[role] || permissions.viewer;
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
                event.oldValues ? JSON.stringify(event.oldValues) : null,
                event.newValues ? JSON.stringify(event.newValues) : null,
                event.success,
                event.errorMessage || null
            ]
        );
    }
}

module.exports = new ClientService();
