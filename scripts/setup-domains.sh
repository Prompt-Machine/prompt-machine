#!/bin/bash

# Prompt Machine Domain Setup Script
# This script helps configure domain names for different environments

set -e

echo "🚀 Prompt Machine Domain Setup"
echo "=============================="

# Default values
APP_DOMAIN=""
API_DOMAIN=""
ENVIRONMENT="production"

# Function to update nginx configuration
update_nginx_config() {
    local app_domain=$1
    local api_domain=$2
    
    echo "📝 Updating nginx configuration..."
    
    # Update app domain in nginx config
    if [ -f "/etc/nginx/sites-available/prompt-machine-app" ]; then
        sudo sed -i "s/server_name .*/server_name $app_domain;/" /etc/nginx/sites-available/prompt-machine-app
        echo "   ✅ Updated app server_name to $app_domain"
    fi
    
    # Update API domain in nginx config
    if [ -f "/etc/nginx/sites-available/prompt-machine-api" ]; then
        sudo sed -i "s/server_name .*/server_name $api_domain;/" /etc/nginx/sites-available/prompt-machine-api
        echo "   ✅ Updated API server_name to $api_domain"
    fi
    
    # Test and reload nginx
    sudo nginx -t && sudo systemctl reload nginx
    echo "   ✅ Nginx configuration reloaded"
}

# Function to update SSL certificates
update_ssl_certificates() {
    local app_domain=$1
    local api_domain=$2
    
    echo "🔒 Updating SSL certificates..."
    
    # Only run certbot if certificates don't exist
    if [ ! -f "/etc/letsencrypt/live/$app_domain/fullchain.pem" ]; then
        sudo certbot --nginx -d $app_domain --non-interactive --agree-tos --email admin@$app_domain
        echo "   ✅ SSL certificate created for $app_domain"
    else
        echo "   ℹ️  SSL certificate already exists for $app_domain"
    fi
    
    if [ ! -f "/etc/letsencrypt/live/$api_domain/fullchain.pem" ]; then
        sudo certbot --nginx -d $api_domain --non-interactive --agree-tos --email admin@$api_domain
        echo "   ✅ SSL certificate created for $api_domain"
    else
        echo "   ℹ️  SSL certificate already exists for $api_domain"
    fi
}

# Function to update environment variables
update_env_variables() {
    local app_domain=$1
    local api_domain=$2
    
    echo "🔧 Updating environment variables..."
    
    # Update .env file
    if [ -f "/home/ubuntu/prompt-machine/.env" ]; then
        sed -i "s|APP_URL=.*|APP_URL=https://$app_domain|" /home/ubuntu/prompt-machine/.env
        sed -i "s|API_URL=.*|API_URL=https://$api_domain|" /home/ubuntu/prompt-machine/.env
        echo "   ✅ Updated .env file with new domains"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--app-domain)
            APP_DOMAIN="$2"
            shift 2
            ;;
        -p|--api-domain)
            API_DOMAIN="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -a, --app-domain DOMAIN    Set app domain (e.g., app.yourdomain.com)"
            echo "  -p, --api-domain DOMAIN    Set API domain (e.g., api.yourdomain.com)"
            echo "  -e, --environment ENV      Set environment (production, staging, development)"
            echo "  -h, --help                 Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --app-domain app.example.com --api-domain api.example.com"
            echo "  $0 -a myapp.com -p api.myapp.com -e production"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Interactive mode if no domains provided
if [ -z "$APP_DOMAIN" ] || [ -z "$API_DOMAIN" ]; then
    echo ""
    echo "🔍 Domain Configuration Required"
    echo ""
    
    if [ -z "$APP_DOMAIN" ]; then
        read -p "Enter app domain (e.g., app.yourdomain.com): " APP_DOMAIN
    fi
    
    if [ -z "$API_DOMAIN" ]; then
        read -p "Enter API domain (e.g., api.yourdomain.com): " API_DOMAIN
    fi
fi

# Validate domains
if [ -z "$APP_DOMAIN" ] || [ -z "$API_DOMAIN" ]; then
    echo "❌ Error: Both app and API domains are required"
    exit 1
fi

echo ""
echo "📋 Configuration Summary:"
echo "   Environment: $ENVIRONMENT"
echo "   App Domain:  $APP_DOMAIN"
echo "   API Domain:  $API_DOMAIN"
echo ""

read -p "Continue with this configuration? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled"
    exit 1
fi

echo ""
echo "🔄 Applying configuration changes..."

# Apply changes
update_nginx_config "$APP_DOMAIN" "$API_DOMAIN"
update_env_variables "$APP_DOMAIN" "$API_DOMAIN"

# Ask about SSL certificates
echo ""
read -p "🔒 Update SSL certificates? This requires certbot and may take a few minutes (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_ssl_certificates "$APP_DOMAIN" "$API_DOMAIN"
fi

# Restart services
echo ""
echo "🔄 Restarting services..."
sudo systemctl reload nginx
cd /home/ubuntu/prompt-machine && pm2 restart all --update-env

echo ""
echo "🎉 Domain setup complete!"
echo ""
echo "Your Prompt Machine is now configured for:"
echo "   App: https://$APP_DOMAIN"
echo "   API: https://$API_DOMAIN"
echo ""
echo "Next steps:"
echo "1. Update your DNS records to point to this server"
echo "2. Test the application at https://$APP_DOMAIN"
echo "3. Verify API health at https://$API_DOMAIN/health"
echo ""