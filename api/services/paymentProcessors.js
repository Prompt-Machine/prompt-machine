// ========================================
// MULTI-PAYMENT PROCESSOR SERVICE
// Square, Stripe, and PayPal Integration
// ========================================

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Client, Environment } = require('square');
const paypal = require('@paypal/checkout-server-sdk');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// ========================================
// SQUARE CONFIGURATION
// ========================================

const squareClient = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.NODE_ENV === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
});

// ========================================
// PAYPAL CONFIGURATION
// ========================================

const paypalEnvironment = process.env.NODE_ENV === 'production'
    ? new paypal.core.LiveEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
    )
    : new paypal.core.SandboxEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
    );

const paypalClient = new paypal.core.PayPalHttpClient(paypalEnvironment);

// ========================================
// PAYMENT PROCESSOR SERVICE
// ========================================

class PaymentProcessorService {
    constructor() {
        this.processors = {
            stripe: this.stripeProcessor,
            square: this.squareProcessor,
            paypal: this.paypalProcessor
        };
    }

    /**
     * Process payment with selected processor
     */
    async processPayment(processor, paymentData) {
        if (!this.processors[processor]) {
            throw new Error(`Payment processor ${processor} not supported`);
        }

        try {
            const result = await this.processors[processor].call(this, paymentData);
            
            // Log payment attempt
            await this.logPaymentAttempt({
                processor,
                amount: paymentData.amount,
                currency: paymentData.currency,
                customerId: paymentData.customerId,
                success: result.success,
                transactionId: result.transactionId
            });

            return result;
        } catch (error) {
            // Log failed payment
            await this.logPaymentAttempt({
                processor,
                amount: paymentData.amount,
                currency: paymentData.currency,
                customerId: paymentData.customerId,
                success: false,
                error: error.message
            });

            throw error;
        }
    }

    // ========================================
    // STRIPE PROCESSOR
    // ========================================

    async stripeProcessor(paymentData) {
        const {
            amount,
            currency = 'usd',
            customerId,
            paymentMethodId,
            description,
            metadata = {},
            setupFutureUsage = null,
            subscriptionId = null
        } = paymentData;

        try {
            // Get or create Stripe customer
            let stripeCustomerId = await this.getStripeCustomerId(customerId);
            
            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                    metadata: { userId: customerId }
                });
                stripeCustomerId = customer.id;
                await this.saveStripeCustomerId(customerId, stripeCustomerId);
            }

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to cents
                currency,
                customer: stripeCustomerId,
                payment_method: paymentMethodId,
                description,
                metadata: {
                    ...metadata,
                    userId: customerId,
                    subscriptionId
                },
                confirm: true,
                setup_future_usage: setupFutureUsage
            });

            // Handle subscription payment if applicable
            if (subscriptionId) {
                await this.updateSubscriptionPayment(subscriptionId, paymentIntent.id, 'stripe');
            }

            return {
                success: true,
                processor: 'stripe',
                transactionId: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency,
                receiptUrl: paymentIntent.charges?.data[0]?.receipt_url
            };

        } catch (error) {
            console.error('Stripe payment error:', error);
            throw new Error(`Stripe payment failed: ${error.message}`);
        }
    }

    /**
     * Create Stripe subscription
     */
    async createStripeSubscription(subscriptionData) {
        const {
            customerId,
            priceId,
            paymentMethodId,
            trialDays = 0,
            metadata = {}
        } = subscriptionData;

        try {
            let stripeCustomerId = await this.getStripeCustomerId(customerId);
            
            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                    metadata: { userId: customerId }
                });
                stripeCustomerId = customer.id;
                await this.saveStripeCustomerId(customerId, stripeCustomerId);
            }

            // Attach payment method to customer
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: stripeCustomerId
            });

            // Set as default payment method
            await stripe.customers.update(stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: stripeCustomerId,
                items: [{ price: priceId }],
                trial_period_days: trialDays,
                metadata: {
                    ...metadata,
                    userId: customerId
                },
                payment_settings: {
                    payment_method_types: ['card'],
                    save_default_payment_method: 'on_subscription'
                }
            });

            return {
                success: true,
                subscriptionId: subscription.id,
                status: subscription.status,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
            };

        } catch (error) {
            console.error('Stripe subscription error:', error);
            throw new Error(`Failed to create subscription: ${error.message}`);
        }
    }

    // ========================================
    // SQUARE PROCESSOR
    // ========================================

    async squareProcessor(paymentData) {
        const {
            amount,
            currency = 'USD',
            customerId,
            sourceId, // Card nonce or customer card ID
            description,
            locationId = process.env.SQUARE_LOCATION_ID,
            metadata = {}
        } = paymentData;

        try {
            // Get or create Square customer
            let squareCustomerId = await this.getSquareCustomerId(customerId);
            
            if (!squareCustomerId) {
                const { result: customer } = await squareClient.customersApi.createCustomer({
                    referenceId: customerId,
                    note: `User ID: ${customerId}`
                });
                squareCustomerId = customer.customer.id;
                await this.saveSquareCustomerId(customerId, squareCustomerId);
            }

            // Create payment request
            const requestBody = {
                sourceId,
                idempotencyKey: crypto.randomUUID(),
                amountMoney: {
                    amount: Math.round(amount * 100), // Convert to cents
                    currency
                },
                customerId: squareCustomerId,
                locationId,
                note: description,
                referenceId: metadata.referenceId || customerId
            };

            // Process payment
            const { result: payment } = await squareClient.paymentsApi.createPayment(requestBody);

            return {
                success: true,
                processor: 'square',
                transactionId: payment.payment.id,
                status: payment.payment.status,
                amount: payment.payment.amountMoney.amount / 100,
                currency: payment.payment.amountMoney.currency,
                receiptUrl: payment.payment.receiptUrl
            };

        } catch (error) {
            console.error('Square payment error:', error);
            throw new Error(`Square payment failed: ${error.message}`);
        }
    }

    /**
     * Create Square subscription
     */
    async createSquareSubscription(subscriptionData) {
        const {
            customerId,
            planId,
            cardId,
            startDate = new Date(),
            locationId = process.env.SQUARE_LOCATION_ID
        } = subscriptionData;

        try {
            let squareCustomerId = await this.getSquareCustomerId(customerId);
            
            if (!squareCustomerId) {
                const { result: customer } = await squareClient.customersApi.createCustomer({
                    referenceId: customerId
                });
                squareCustomerId = customer.customer.id;
                await this.saveSquareCustomerId(customerId, squareCustomerId);
            }

            // Create subscription
            const { result: subscription } = await squareClient.subscriptionsApi.createSubscription({
                locationId,
                planId,
                customerId: squareCustomerId,
                cardId,
                startDate: startDate.toISOString().split('T')[0]
            });

            return {
                success: true,
                subscriptionId: subscription.subscription.id,
                status: subscription.subscription.status,
                startDate: subscription.subscription.startDate,
                invoiceIds: subscription.subscription.invoiceIds
            };

        } catch (error) {
            console.error('Square subscription error:', error);
            throw new Error(`Failed to create Square subscription: ${error.message}`);
        }
    }

    /**
     * Create Square catalog item (for subscriptions)
     */
    async createSquarePlan(planData) {
        const {
            name,
            amount,
            currency = 'USD',
            interval = 'MONTHLY'
        } = planData;

        try {
            const { result: catalogItem } = await squareClient.catalogApi.upsertCatalogObject({
                idempotencyKey: crypto.randomUUID(),
                object: {
                    type: 'SUBSCRIPTION_PLAN',
                    id: `#${name.toLowerCase().replace(/\s+/g, '-')}`,
                    subscriptionPlanData: {
                        name,
                        phases: [{
                            cadence: interval,
                            recurringPriceMoney: {
                                amount: Math.round(amount * 100),
                                currency
                            }
                        }]
                    }
                }
            });

            return {
                success: true,
                planId: catalogItem.catalogObject.id,
                name: catalogItem.catalogObject.subscriptionPlanData.name
            };

        } catch (error) {
            console.error('Square plan creation error:', error);
            throw new Error(`Failed to create Square plan: ${error.message}`);
        }
    }

    // ========================================
    // PAYPAL PROCESSOR
    // ========================================

    async paypalProcessor(paymentData) {
        const {
            amount,
            currency = 'USD',
            customerId,
            orderId, // PayPal order ID from client
            description,
            items = [],
            metadata = {}
        } = paymentData;

        try {
            if (orderId) {
                // Capture existing order
                return await this.capturePayPalOrder(orderId);
            }

            // Create new order
            const request = new paypal.orders.OrdersCreateRequest();
            request.prefer("return=representation");
            request.requestBody({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: customerId,
                    description,
                    amount: {
                        currency_code: currency,
                        value: amount.toFixed(2),
                        breakdown: {
                            item_total: {
                                currency_code: currency,
                                value: amount.toFixed(2)
                            }
                        }
                    },
                    items: items.length > 0 ? items : [{
                        name: description || 'Payment',
                        unit_amount: {
                            currency_code: currency,
                            value: amount.toFixed(2)
                        },
                        quantity: '1'
                    }]
                }],
                application_context: {
                    brand_name: 'Prompt Machine',
                    landing_page: 'LOGIN',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    return_url: `${process.env.FRONTEND_URL}/payment/success`,
                    cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`
                }
            });

            const order = await paypalClient.execute(request);

            return {
                success: true,
                processor: 'paypal',
                orderId: order.result.id,
                status: order.result.status,
                approvalUrl: order.result.links.find(link => link.rel === 'approve').href,
                amount,
                currency
            };

        } catch (error) {
            console.error('PayPal payment error:', error);
            throw new Error(`PayPal payment failed: ${error.message}`);
        }
    }

    /**
     * Capture PayPal order after approval
     */
    async capturePayPalOrder(orderId) {
        try {
            const request = new paypal.orders.OrdersCaptureRequest(orderId);
            request.requestBody({});
            
            const capture = await paypalClient.execute(request);

            return {
                success: true,
                processor: 'paypal',
                transactionId: capture.result.id,
                status: capture.result.status,
                payerId: capture.result.payer.payer_id,
                amount: parseFloat(capture.result.purchase_units[0].amount.value),
                currency: capture.result.purchase_units[0].amount.currency_code
            };

        } catch (error) {
            console.error('PayPal capture error:', error);
            throw new Error(`PayPal capture failed: ${error.message}`);
        }
    }

    /**
     * Create PayPal subscription
     */
    async createPayPalSubscription(subscriptionData) {
        const {
            planId,
            customerId,
            startTime = new Date(),
            returnUrl = `${process.env.FRONTEND_URL}/subscription/success`,
            cancelUrl = `${process.env.FRONTEND_URL}/subscription/cancel`
        } = subscriptionData;

        try {
            const request = new paypal.subscriptions.SubscriptionsCreateRequest();
            request.requestBody({
                plan_id: planId,
                start_time: startTime.toISOString(),
                subscriber: {
                    name: {
                        given_name: subscriptionData.firstName || 'User',
                        surname: subscriptionData.lastName || customerId
                    },
                    email_address: subscriptionData.email
                },
                application_context: {
                    brand_name: 'Prompt Machine',
                    locale: 'en-US',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'SUBSCRIBE_NOW',
                    payment_method: {
                        payer_selected: 'PAYPAL',
                        payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
                    },
                    return_url: returnUrl,
                    cancel_url: cancelUrl
                }
            });

            const subscription = await paypalClient.execute(request);

            return {
                success: true,
                subscriptionId: subscription.result.id,
                status: subscription.result.status,
                approvalUrl: subscription.result.links.find(link => link.rel === 'approve').href
            };

        } catch (error) {
            console.error('PayPal subscription error:', error);
            throw new Error(`Failed to create PayPal subscription: ${error.message}`);
        }
    }

    // ========================================
    // WEBHOOK HANDLERS
    // ========================================

    /**
     * Handle Stripe webhook
     */
    async handleStripeWebhook(event) {
        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.handlePaymentSuccess('stripe', event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await this.handlePaymentFailure('stripe', event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await this.handleInvoicePayment('stripe', event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdate('stripe', event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionCancellation('stripe', event.data.object);
                break;
        }
    }

    /**
     * Handle Square webhook
     */
    async handleSquareWebhook(event) {
        switch (event.type) {
            case 'payment.created':
            case 'payment.updated':
                await this.handlePaymentSuccess('square', event.data.object.payment);
                break;
            case 'subscription.created':
            case 'subscription.updated':
                await this.handleSubscriptionUpdate('square', event.data.object.subscription);
                break;
            case 'invoice.payment_made':
                await this.handleInvoicePayment('square', event.data.object.invoice);
                break;
        }
    }

    /**
     * Handle PayPal webhook
     */
    async handlePayPalWebhook(event) {
        switch (event.event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                await this.handlePaymentSuccess('paypal', event.resource);
                break;
            case 'PAYMENT.CAPTURE.DENIED':
                await this.handlePaymentFailure('paypal', event.resource);
                break;
            case 'BILLING.SUBSCRIPTION.CREATED':
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
                await this.handleSubscriptionUpdate('paypal', event.resource);
                break;
            case 'BILLING.SUBSCRIPTION.CANCELLED':
                await this.handleSubscriptionCancellation('paypal', event.resource);
                break;
        }
    }

    // ========================================
    // PAYMENT METHOD MANAGEMENT
    // ========================================

    /**
     * Save payment method
     */
    async savePaymentMethod(userId, processor, methodData) {
        const query = `
            INSERT INTO payment_methods (
                user_id, processor, type, last4, brand,
                exp_month, exp_year, is_default,
                processor_customer_id, processor_method_id,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;

        const result = await pool.query(query, [
            userId,
            processor,
            methodData.type || 'card',
            methodData.last4,
            methodData.brand,
            methodData.expMonth,
            methodData.expYear,
            methodData.isDefault || false,
            methodData.customerId,
            methodData.methodId,
            JSON.stringify(methodData.metadata || {})
        ]);

        return result.rows[0];
    }

    /**
     * Get user payment methods
     */
    async getUserPaymentMethods(userId, processor = null) {
        let query = 'SELECT * FROM payment_methods WHERE user_id = $1';
        const params = [userId];

        if (processor) {
            query += ' AND processor = $2';
            params.push(processor);
        }

        query += ' ORDER BY is_default DESC, created_at DESC';

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Delete payment method
     */
    async deletePaymentMethod(userId, methodId, processor) {
        // Delete from processor first
        try {
            switch (processor) {
                case 'stripe':
                    await stripe.paymentMethods.detach(methodId);
                    break;
                case 'square':
                    // Square card deletion
                    const customerId = await this.getSquareCustomerId(userId);
                    if (customerId) {
                        await squareClient.customersApi.deleteCustomerCard(customerId, methodId);
                    }
                    break;
                case 'paypal':
                    // PayPal doesn't support direct payment method deletion
                    break;
            }
        } catch (error) {
            console.error(`Failed to delete payment method from ${processor}:`, error);
        }

        // Delete from database
        await pool.query(
            'DELETE FROM payment_methods WHERE user_id = $1 AND processor_method_id = $2',
            [userId, methodId]
        );

        return { success: true };
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    async getStripeCustomerId(userId) {
        const result = await pool.query(
            'SELECT processor_customer_id FROM payment_methods WHERE user_id = $1 AND processor = $2 LIMIT 1',
            [userId, 'stripe']
        );
        return result.rows[0]?.processor_customer_id;
    }

    async saveStripeCustomerId(userId, customerId) {
        await pool.query(
            `INSERT INTO payment_processor_customers (user_id, processor, customer_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, processor) DO UPDATE SET customer_id = $3`,
            [userId, 'stripe', customerId]
        );
    }

    async getSquareCustomerId(userId) {
        const result = await pool.query(
            'SELECT processor_customer_id FROM payment_methods WHERE user_id = $1 AND processor = $2 LIMIT 1',
            [userId, 'square']
        );
        return result.rows[0]?.processor_customer_id;
    }

    async saveSquareCustomerId(userId, customerId) {
        await pool.query(
            `INSERT INTO payment_processor_customers (user_id, processor, customer_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, processor) DO UPDATE SET customer_id = $3`,
            [userId, 'square', customerId]
        );
    }

    async updateSubscriptionPayment(subscriptionId, paymentId, processor) {
        await pool.query(
            `UPDATE subscriptions 
             SET last_payment_id = $1, last_payment_date = NOW(), payment_processor = $2
             WHERE id = $3`,
            [paymentId, processor, subscriptionId]
        );
    }

    async handlePaymentSuccess(processor, payment) {
        // Update invoice as paid
        // Log successful payment
        // Send confirmation email
        console.log(`Payment successful via ${processor}:`, payment);
    }

    async handlePaymentFailure(processor, payment) {
        // Log failed payment
        // Send failure notification
        // Update subscription status if needed
        console.log(`Payment failed via ${processor}:`, payment);
    }

    async handleInvoicePayment(processor, invoice) {
        // Update invoice status
        // Update subscription
        console.log(`Invoice paid via ${processor}:`, invoice);
    }

    async handleSubscriptionUpdate(processor, subscription) {
        // Update subscription status
        console.log(`Subscription updated via ${processor}:`, subscription);
    }

    async handleSubscriptionCancellation(processor, subscription) {
        // Cancel subscription
        // Update user access
        console.log(`Subscription cancelled via ${processor}:`, subscription);
    }

    async logPaymentAttempt(data) {
        await pool.query(
            `INSERT INTO payment_logs (
                processor, amount, currency, customer_id,
                success, transaction_id, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                data.processor,
                data.amount,
                data.currency,
                data.customerId,
                data.success,
                data.transactionId || null,
                data.error || null
            ]
        );
    }

    /**
     * Get processor fee estimates
     */
    getProcessorFees(amount, processor) {
        const fees = {
            stripe: {
                percentage: 0.029, // 2.9%
                fixed: 0.30 // 30 cents
            },
            square: {
                percentage: 0.029, // 2.9%
                fixed: 0.30 // 30 cents
            },
            paypal: {
                percentage: 0.0349, // 3.49%
                fixed: 0.49 // 49 cents
            }
        };

        const processorFees = fees[processor];
        if (!processorFees) {
            return { fee: 0, net: amount };
        }

        const fee = (amount * processorFees.percentage) + processorFees.fixed;
        const net = amount - fee;

        return {
            fee: Math.round(fee * 100) / 100,
            net: Math.round(net * 100) / 100,
            percentage: processorFees.percentage * 100,
            fixed: processorFees.fixed
        };
    }
}

module.exports = new PaymentProcessorService();
