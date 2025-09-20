// ========================================
// BILLING ROUTES
// Square, Stripe, and PayPal endpoints
// ========================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const paymentProcessors = require('../services/paymentProcessors');
const subscriptionService = require('../services/subscriptionService');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// ========================================
// PAYMENT PROCESSING ENDPOINTS
// ========================================

/**
 * POST /api/billing/process-payment
 * Process payment with selected processor
 */
router.post('/process-payment', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            processor, // 'stripe', 'square', or 'paypal'
            amount,
            currency = 'USD',
            description,
            paymentMethodId, // For Stripe
            sourceId, // For Square
            orderId, // For PayPal
            metadata = {}
        } = req.body;

        // Validate processor
        if (!['stripe', 'square', 'paypal'].includes(processor)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment processor'
            });
        }

        // Process payment
        const result = await paymentProcessors.processPayment(processor, {
            amount,
            currency,
            customerId: userId,
            paymentMethodId,
            sourceId,
            orderId,
            description,
            metadata
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/billing/payment-methods
 * Get user's saved payment methods
 */
router.get('/payment-methods', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { processor } = req.query;

        const methods = await paymentProcessors.getUserPaymentMethods(userId, processor);

        res.json({
            success: true,
            data: methods
        });

    } catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment methods'
        });
    }
});

/**
 * POST /api/billing/payment-methods
 * Add new payment method
 */
router.post('/payment-methods', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { processor, methodData } = req.body;

        let savedMethod;

        switch (processor) {
            case 'stripe':
                // Attach Stripe payment method
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                const paymentMethod = await stripe.paymentMethods.retrieve(methodData.paymentMethodId);
                
                savedMethod = await paymentProcessors.savePaymentMethod(userId, 'stripe', {
                    type: paymentMethod.type,
                    last4: paymentMethod.card?.last4,
                    brand: paymentMethod.card?.brand,
                    expMonth: paymentMethod.card?.exp_month,
                    expYear: paymentMethod.card?.exp_year,
                    methodId: paymentMethod.id,
                    customerId: paymentMethod.customer
                });
                break;

            case 'square':
                // Save Square card
                savedMethod = await paymentProcessors.savePaymentMethod(userId, 'square', {
                    type: 'card',
                    last4: methodData.last4,
                    brand: methodData.brand,
                    methodId: methodData.cardId,
                    customerId: methodData.customerId
                });
                break;

            case 'paypal':
                // Save PayPal account
                savedMethod = await paymentProcessors.savePaymentMethod(userId, 'paypal', {
                    type: 'paypal',
                    email: methodData.email,
                    payerId: methodData.payerId
                });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid payment processor'
                });
        }

        res.json({
            success: true,
            data: savedMethod
        });

    } catch (error) {
        console.error('Add payment method error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add payment method'
        });
    }
});

/**
 * DELETE /api/billing/payment-methods/:id
 * Delete payment method
 */
router.delete('/payment-methods/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { processor } = req.query;

        await paymentProcessors.deletePaymentMethod(userId, id, processor);

        res.json({
            success: true,
            message: 'Payment method deleted'
        });

    } catch (error) {
        console.error('Delete payment method error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete payment method'
        });
    }
});

// ========================================
// STRIPE SPECIFIC ENDPOINTS
// ========================================

/**
 * POST /api/billing/stripe/setup-intent
 * Create Stripe setup intent for saving cards
 */
router.post('/stripe/setup-intent', authenticateToken, async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const userId = req.user.id;

        // Get or create customer
        let customerId = await paymentProcessors.getStripeCustomerId(userId);
        
        if (!customerId) {
            const customer = await stripe.customers.create({
                metadata: { userId }
            });
            customerId = customer.id;
            await paymentProcessors.saveStripeCustomerId(userId, customerId);
        }

        // Create setup intent
        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            payment_method_types: ['card'],
            usage: 'off_session'
        });

        res.json({
            success: true,
            data: {
                clientSecret: setupIntent.client_secret,
                customerId
            }
        });

    } catch (error) {
        console.error('Stripe setup intent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create setup intent'
        });
    }
});

/**
 * POST /api/billing/stripe/create-subscription
 * Create Stripe subscription
 */
router.post('/stripe/create-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { priceId, paymentMethodId, trialDays } = req.body;

        const result = await paymentProcessors.createStripeSubscription({
            customerId: userId,
            priceId,
            paymentMethodId,
            trialDays,
            metadata: {
                userId,
                platform: 'prompt-machine'
            }
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Stripe subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// SQUARE SPECIFIC ENDPOINTS
// ========================================

/**
 * POST /api/billing/square/create-card
 * Create Square card on file
 */
router.post('/square/create-card', authenticateToken, async (req, res) => {
    try {
        const { Client, Environment } = require('square');
        const userId = req.user.id;
        const { cardNonce } = req.body;

        const squareClient = new Client({
            accessToken: process.env.SQUARE_ACCESS_TOKEN,
            environment: process.env.NODE_ENV === 'production' 
                ? Environment.Production 
                : Environment.Sandbox
        });

        // Get or create customer
        let customerId = await paymentProcessors.getSquareCustomerId(userId);
        
        if (!customerId) {
            const { result: customer } = await squareClient.customersApi.createCustomer({
                referenceId: userId.toString()
            });
            customerId = customer.customer.id;
            await paymentProcessors.saveSquareCustomerId(userId, customerId);
        }

        // Create card on file
        const { result: card } = await squareClient.cardsApi.createCard({
            idempotencyKey: require('crypto').randomUUID(),
            sourceId: cardNonce,
            card: {
                customerId
            }
        });

        // Save to database
        const savedMethod = await paymentProcessors.savePaymentMethod(userId, 'square', {
            type: 'card',
            last4: card.card.last4,
            brand: card.card.cardBrand,
            expMonth: card.card.expMonth,
            expYear: card.card.expYear,
            methodId: card.card.id,
            customerId
        });

        res.json({
            success: true,
            data: savedMethod
        });

    } catch (error) {
        console.error('Square card creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save card'
        });
    }
});

/**
 * POST /api/billing/square/create-subscription
 * Create Square subscription
 */
router.post('/square/create-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { planId, cardId, startDate } = req.body;

        const result = await paymentProcessors.createSquareSubscription({
            customerId: userId,
            planId,
            cardId,
            startDate: startDate ? new Date(startDate) : undefined
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Square subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/billing/square/create-plan
 * Create Square subscription plan
 */
router.post('/square/create-plan', authenticateToken, async (req, res) => {
    try {
        // Admin only
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { name, amount, currency, interval } = req.body;

        const result = await paymentProcessors.createSquarePlan({
            name,
            amount,
            currency,
            interval
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Square plan creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// PAYPAL SPECIFIC ENDPOINTS
// ========================================

/**
 * POST /api/billing/paypal/create-order
 * Create PayPal order
 */
router.post('/paypal/create-order', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, currency = 'USD', description, items } = req.body;

        const result = await paymentProcessors.paypalProcessor({
            amount,
            currency,
            customerId: userId,
            description,
            items
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('PayPal order creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/billing/paypal/capture-order
 * Capture PayPal order after approval
 */
router.post('/paypal/capture-order', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.body;

        const result = await paymentProcessors.capturePayPalOrder(orderId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('PayPal capture error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/billing/paypal/create-subscription
 * Create PayPal subscription
 */
router.post('/paypal/create-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { planId, email, firstName, lastName } = req.body;

        const result = await paymentProcessors.createPayPalSubscription({
            planId,
            customerId: userId,
            email,
            firstName,
            lastName
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('PayPal subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// INVOICE ENDPOINTS
// ========================================

/**
 * GET /api/billing/invoices
 * Get user invoices
 */
router.get('/invoices', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50, offset = 0, status } = req.query;

        let query = `
            SELECT 
                i.*,
                s.billing_cycle,
                sp.name as plan_name
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1
        `;

        const params = [userId];

        if (status) {
            query += ' AND i.status = $2';
            params.push(status);
        }

        query += ' ORDER BY i.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoices'
        });
    }
});

/**
 * GET /api/billing/invoices/:id
 * Get specific invoice
 */
router.get('/invoices/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const result = await pool.query(
            `SELECT i.* 
             FROM invoices i
             JOIN subscriptions s ON i.subscription_id = s.id
             WHERE i.id = $1 AND s.user_id = $2`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoice'
        });
    }
});

/**
 * POST /api/billing/invoices/:id/pay
 * Pay invoice
 */
router.post('/invoices/:id/pay', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { processor, paymentMethodId } = req.body;

        // Get invoice details
        const invoiceResult = await pool.query(
            `SELECT i.*, s.user_id 
             FROM invoices i
             JOIN subscriptions s ON i.subscription_id = s.id
             WHERE i.id = $1 AND s.user_id = $2`,
            [id, userId]
        );

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        const invoice = invoiceResult.rows[0];

        if (invoice.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Invoice already paid'
            });
        }

        // Process payment
        const paymentResult = await paymentProcessors.processPayment(processor, {
            amount: invoice.total,
            currency: invoice.currency,
            customerId: userId,
            paymentMethodId,
            description: `Invoice ${invoice.invoice_number}`,
            metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number
            }
        });

        // Update invoice status
        if (paymentResult.success) {
            await pool.query(
                'UPDATE invoices SET status = $1, paid_date = NOW(), payment_processor = $2 WHERE id = $3',
                ['paid', processor, id]
            );
        }

        res.json({
            success: true,
            data: paymentResult
        });

    } catch (error) {
        console.error('Pay invoice error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process payment'
        });
    }
});

// ========================================
// WEBHOOK ENDPOINTS
// ========================================

/**
 * POST /api/billing/webhooks/stripe
 * Handle Stripe webhooks
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const sig = req.headers['stripe-signature'];

        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        await paymentProcessors.handleStripeWebhook(event);

        res.json({ received: true });

    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/billing/webhooks/square
 * Handle Square webhooks
 */
router.post('/webhooks/square', async (req, res) => {
    try {
        const event = req.body;

        // Verify webhook signature
        const signature = req.headers['x-square-signature'];
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.SQUARE_WEBHOOK_SECRET);
        hmac.update(JSON.stringify(req.body));
        const expectedSignature = hmac.digest('base64');

        if (signature !== expectedSignature) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        await paymentProcessors.handleSquareWebhook(event);

        res.json({ received: true });

    } catch (error) {
        console.error('Square webhook error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/billing/webhooks/paypal
 * Handle PayPal webhooks
 */
router.post('/webhooks/paypal', async (req, res) => {
    try {
        const event = req.body;

        // Verify webhook signature
        // PayPal webhook verification is more complex
        // See: https://developer.paypal.com/docs/api-basics/notifications/webhooks/

        await paymentProcessors.handlePayPalWebhook(event);

        res.json({ received: true });

    } catch (error) {
        console.error('PayPal webhook error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/billing/processor-fees
 * Get fee estimates for each processor
 */
router.get('/processor-fees', authenticateToken, async (req, res) => {
    try {
        const { amount = 100 } = req.query;
        const amountNum = parseFloat(amount);

        const fees = {
            stripe: paymentProcessors.getProcessorFees(amountNum, 'stripe'),
            square: paymentProcessors.getProcessorFees(amountNum, 'square'),
            paypal: paymentProcessors.getProcessorFees(amountNum, 'paypal')
        };

        res.json({
            success: true,
            data: fees
        });

    } catch (error) {
        console.error('Get processor fees error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate fees'
        });
    }
});

module.exports = router;
