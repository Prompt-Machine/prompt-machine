// ========================================
// SUBSCRIPTION & BILLING SERVICE
// Complete subscription lifecycle management
// ========================================

const { Pool } = require('pg');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

class SubscriptionService {
    /**
     * Get available subscription plans
     */
    async getPlans(includeInactive = false) {
        let query = `
            SELECT * FROM subscription_plans
            ${!includeInactive ? 'WHERE is_active = true' : ''}
            ORDER BY sort_order ASC, price_monthly ASC
        `;

        const result = await pool.query(query);
        return result.rows;
    }

    /**
     * Get plan by ID or slug
     */
    async getPlan(identifier) {
        const query = `
            SELECT * FROM subscription_plans
            WHERE id = $1 OR slug = $1
        `;

        const result = await pool.query(query, [identifier]);
        if (result.rows.length === 0) {
            throw new Error('Plan not found');
        }

        return result.rows[0];
    }

    /**
     * Create a new subscription
     */
    async createSubscription(userId, planId, billingCycle = 'monthly', clientId = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get plan details
            const plan = await this.getPlan(planId);

            // Cancel any existing active subscriptions
            await client.query(
                `UPDATE subscriptions 
                 SET status = 'cancelled', 
                     cancelled_at = NOW(),
                     updated_at = NOW()
                 WHERE user_id = $1 AND status = 'active'`,
                [userId]
            );

            // Calculate subscription periods
            const now = new Date();
            const periodEnd = new Date();
            if (billingCycle === 'monthly') {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            } else {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            }

            // Create Stripe customer if not exists
            let stripeCustomerId = null;
            if (process.env.STRIPE_ENABLED === 'true') {
                const userResult = await client.query(
                    'SELECT email, full_name FROM users_extended WHERE id = $1',
                    [userId]
                );
                const user = userResult.rows[0];

                // Check if customer exists
                const existingCustomer = await client.query(
                    'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
                    [userId]
                );

                if (existingCustomer.rows.length > 0) {
                    stripeCustomerId = existingCustomer.rows[0].stripe_customer_id;
                } else {
                    // Create new Stripe customer
                    const stripeCustomer = await stripe.customers.create({
                        email: user.email,
                        name: user.full_name,
                        metadata: {
                            user_id: userId,
                            client_id: clientId
                        }
                    });
                    stripeCustomerId = stripeCustomer.id;
                }

                // Create Stripe subscription
                if (plan.price_monthly > 0) {
                    const stripeSubscription = await stripe.subscriptions.create({
                        customer: stripeCustomerId,
                        items: [{
                            price_data: {
                                currency: plan.currency || 'usd',
                                product_data: {
                                    name: plan.name,
                                    description: plan.description
                                },
                                unit_amount: Math.round(
                                    billingCycle === 'monthly' 
                                        ? plan.price_monthly * 100 
                                        : plan.price_yearly * 100
                                ),
                                recurring: {
                                    interval: billingCycle === 'monthly' ? 'month' : 'year'
                                }
                            }
                        }],
                        trial_period_days: plan.trial_days || 0
                    });

                    // Store Stripe subscription ID
                    var stripeSubscriptionId = stripeSubscription.id;
                }
            }

            // Create subscription record
            const subscriptionQuery = `
                INSERT INTO subscriptions (
                    user_id, client_id, plan_id, status,
                    billing_cycle, current_period_start, current_period_end,
                    stripe_customer_id, stripe_subscription_id,
                    trial_start, trial_end
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `;

            const trialEnd = plan.trial_days 
                ? new Date(now.getTime() + (plan.trial_days * 24 * 60 * 60 * 1000))
                : null;

            const subscriptionResult = await client.query(subscriptionQuery, [
                userId,
                clientId,
                planId,
                plan.trial_days ? 'trialing' : 'active',
                billingCycle,
                now,
                periodEnd,
                stripeCustomerId,
                stripeSubscriptionId || null,
                plan.trial_days ? now : null,
                trialEnd
            ]);

            const subscription = subscriptionResult.rows[0];

            // Update user/client with new limits
            if (clientId) {
                await client.query(
                    `UPDATE clients 
                     SET subscription_tier = $1,
                         api_quota = $2,
                         storage_quota_gb = $3,
                         seats_limit = $4
                     WHERE id = $5`,
                    [
                        plan.slug,
                        plan.limits.api_calls || 1000,
                        plan.limits.storage_gb || 10,
                        plan.limits.team_members || 5,
                        clientId
                    ]
                );
            }

            // Create initial invoice if not free plan
            if (plan.price_monthly > 0) {
                await this.createInvoice(client, {
                    subscriptionId: subscription.id,
                    amount: billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly,
                    description: `${plan.name} - ${billingCycle} subscription`
                });
            }

            await client.query('COMMIT');
            return subscription;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(subscriptionId, cancelImmediately = false) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get subscription details
            const subResult = await client.query(
                'SELECT * FROM subscriptions WHERE id = $1',
                [subscriptionId]
            );

            if (subResult.rows.length === 0) {
                throw new Error('Subscription not found');
            }

            const subscription = subResult.rows[0];

            // Cancel in Stripe if applicable
            if (subscription.stripe_subscription_id && process.env.STRIPE_ENABLED === 'true') {
                if (cancelImmediately) {
                    await stripe.subscriptions.del(subscription.stripe_subscription_id);
                } else {
                    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
                        cancel_at_period_end: true
                    });
                }
            }

            // Update subscription status
            const updateQuery = cancelImmediately
                ? `UPDATE subscriptions 
                   SET status = 'cancelled', 
                       cancelled_at = NOW(),
                       updated_at = NOW()
                   WHERE id = $1`
                : `UPDATE subscriptions 
                   SET cancel_at_period_end = true,
                       updated_at = NOW()
                   WHERE id = $1`;

            await client.query(updateQuery, [subscriptionId]);

            await client.query('COMMIT');
            return { success: true, cancelImmediately };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update subscription plan
     */
    async updateSubscription(subscriptionId, newPlanId, prorate = true) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get current subscription
            const subResult = await client.query(
                'SELECT * FROM subscriptions WHERE id = $1',
                [subscriptionId]
            );

            if (subResult.rows.length === 0) {
                throw new Error('Subscription not found');
            }

            const subscription = subResult.rows[0];

            // Get new plan details
            const newPlan = await this.getPlan(newPlanId);

            // Update in Stripe if applicable
            if (subscription.stripe_subscription_id && process.env.STRIPE_ENABLED === 'true') {
                // Get Stripe subscription
                const stripeSubscription = await stripe.subscriptions.retrieve(
                    subscription.stripe_subscription_id
                );

                // Update subscription item
                await stripe.subscriptions.update(subscription.stripe_subscription_id, {
                    items: [{
                        id: stripeSubscription.items.data[0].id,
                        price_data: {
                            currency: newPlan.currency || 'usd',
                            product_data: {
                                name: newPlan.name,
                                description: newPlan.description
                            },
                            unit_amount: Math.round(
                                subscription.billing_cycle === 'monthly' 
                                    ? newPlan.price_monthly * 100 
                                    : newPlan.price_yearly * 100
                            ),
                            recurring: {
                                interval: subscription.billing_cycle === 'monthly' ? 'month' : 'year'
                            }
                        }
                    }],
                    proration_behavior: prorate ? 'create_prorations' : 'none'
                });
            }

            // Update subscription plan
            await client.query(
                `UPDATE subscriptions 
                 SET plan_id = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [newPlanId, subscriptionId]
            );

            // Update client limits if applicable
            if (subscription.client_id) {
                await client.query(
                    `UPDATE clients 
                     SET subscription_tier = $1,
                         api_quota = $2,
                         storage_quota_gb = $3,
                         seats_limit = $4
                     WHERE id = $5`,
                    [
                        newPlan.slug,
                        newPlan.limits.api_calls || 1000,
                        newPlan.limits.storage_gb || 10,
                        newPlan.limits.team_members || 5,
                        subscription.client_id
                    ]
                );
            }

            await client.query('COMMIT');
            return { success: true, newPlan };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get user's active subscription
     */
    async getUserSubscription(userId) {
        const query = `
            SELECT 
                s.*,
                sp.name as plan_name,
                sp.features as plan_features,
                sp.limits as plan_limits,
                sp.price_monthly,
                sp.price_yearly
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1 
                  AND s.status IN ('active', 'trialing')
            ORDER BY s.created_at DESC
            LIMIT 1
        `;

        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    }

    /**
     * Check subscription limits
     */
    async checkLimit(userId, limitType) {
        const subscription = await this.getUserSubscription(userId);
        
        if (!subscription) {
            // Use free tier limits
            const freePlan = await pool.query(
                "SELECT limits FROM subscription_plans WHERE slug = 'free'"
            );
            const limits = freePlan.rows[0].limits;
            return this.validateLimit(userId, limitType, limits);
        }

        return this.validateLimit(userId, limitType, subscription.plan_limits);
    }

    /**
     * Validate specific limit
     */
    async validateLimit(userId, limitType, limits) {
        const limit = limits[limitType];
        
        if (limit === -1) {
            return { allowed: true, unlimited: true };
        }

        let currentUsage = 0;
        
        switch (limitType) {
            case 'tools':
                const toolResult = await pool.query(
                    'SELECT COUNT(*) as count FROM projects_v6 WHERE user_id = $1',
                    [userId]
                );
                currentUsage = parseInt(toolResult.rows[0].count);
                break;
                
            case 'api_calls':
                // Count API calls in current period
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const apiResult = await pool.query(
                    `SELECT COUNT(*) as count FROM analytics_events 
                     WHERE user_id = $1 AND created_at >= $2 AND event_type = 'api_call'`,
                    [userId, startOfMonth]
                );
                currentUsage = parseInt(apiResult.rows[0].count);
                break;
                
            case 'team_members':
                const teamResult = await pool.query(
                    `SELECT COUNT(*) as count FROM client_team_members ctm
                     JOIN users_extended u ON ctm.user_id = u.id
                     WHERE u.id = $1`,
                    [userId]
                );
                currentUsage = parseInt(teamResult.rows[0].count);
                break;
        }

        return {
            allowed: currentUsage < limit,
            currentUsage,
            limit,
            remaining: Math.max(0, limit - currentUsage)
        };
    }

    /**
     * Create invoice
     */
    async createInvoice(client, invoiceData) {
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        
        const query = `
            INSERT INTO invoices (
                subscription_id, invoice_number, status,
                amount, tax, total, currency,
                due_date, line_items
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;

        const tax = invoiceData.amount * 0.13; // Example tax rate
        const total = invoiceData.amount + tax;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const lineItems = [{
            description: invoiceData.description,
            quantity: 1,
            amount: invoiceData.amount
        }];

        const result = await client.query(query, [
            invoiceData.subscriptionId,
            invoiceNumber,
            'pending',
            invoiceData.amount,
            tax,
            total,
            invoiceData.currency || 'USD',
            dueDate,
            JSON.stringify(lineItems)
        ]);

        return result.rows[0];
    }

    /**
     * Get billing history
     */
    async getBillingHistory(userId, limit = 50) {
        const query = `
            SELECT 
                i.*,
                s.billing_cycle,
                sp.name as plan_name
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1
            ORDER BY i.created_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Process webhook from payment provider
     */
    async processWebhook(provider, event) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (provider === 'stripe') {
                switch (event.type) {
                    case 'invoice.payment_succeeded':
                        await this.handleSuccessfulPayment(client, event.data.object);
                        break;
                    case 'invoice.payment_failed':
                        await this.handleFailedPayment(client, event.data.object);
                        break;
                    case 'customer.subscription.deleted':
                        await this.handleSubscriptionDeleted(client, event.data.object);
                        break;
                    case 'customer.subscription.updated':
                        await this.handleSubscriptionUpdated(client, event.data.object);
                        break;
                }
            }

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
     * Handle successful payment
     */
    async handleSuccessfulPayment(client, invoice) {
        // Update invoice status
        await client.query(
            `UPDATE invoices 
             SET status = 'paid',
                 paid_date = NOW(),
                 stripe_invoice_id = $1
             WHERE invoice_number = $2`,
            [invoice.id, invoice.number]
        );

        // Update subscription if needed
        if (invoice.subscription) {
            await client.query(
                `UPDATE subscriptions 
                 SET status = 'active',
                     current_period_start = to_timestamp($1),
                     current_period_end = to_timestamp($2)
                 WHERE stripe_subscription_id = $3`,
                [
                    invoice.current_period_start,
                    invoice.current_period_end,
                    invoice.subscription
                ]
            );
        }
    }

    /**
     * Handle failed payment
     */
    async handleFailedPayment(client, invoice) {
        // Update invoice status
        await client.query(
            `UPDATE invoices 
             SET status = 'failed'
             WHERE stripe_invoice_id = $1`,
            [invoice.id]
        );

        // Suspend subscription after multiple failures
        if (invoice.attempt_count >= 3) {
            await client.query(
                `UPDATE subscriptions 
                 SET status = 'suspended'
                 WHERE stripe_subscription_id = $1`,
                [invoice.subscription]
            );
        }
    }

    /**
     * Handle subscription deletion
     */
    async handleSubscriptionDeleted(client, subscription) {
        await client.query(
            `UPDATE subscriptions 
             SET status = 'cancelled',
                 cancelled_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [subscription.id]
        );
    }

    /**
     * Handle subscription update
     */
    async handleSubscriptionUpdated(client, subscription) {
        await client.query(
            `UPDATE subscriptions 
             SET status = $1,
                 current_period_start = to_timestamp($2),
                 current_period_end = to_timestamp($3)
             WHERE stripe_subscription_id = $4`,
            [
                subscription.status,
                subscription.current_period_start,
                subscription.current_period_end,
                subscription.id
            ]
        );
    }

    /**
     * Get subscription statistics
     */
    async getSubscriptionStats() {
        const query = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
                COUNT(*) FILTER (WHERE status = 'trialing') as trial_subscriptions,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_subscriptions,
                SUM(sp.price_monthly) FILTER (WHERE s.status = 'active' AND s.billing_cycle = 'monthly') as monthly_revenue,
                SUM(sp.price_yearly / 12) FILTER (WHERE s.status = 'active' AND s.billing_cycle = 'yearly') as yearly_revenue,
                COUNT(DISTINCT s.user_id) as total_subscribers
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
        `;

        const result = await pool.query(query);
        return result.rows[0];
    }
}

module.exports = new SubscriptionService();
