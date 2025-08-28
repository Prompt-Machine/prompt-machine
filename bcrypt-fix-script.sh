#!/bin/bash
# Quick fix for bcrypt password generation
# Run this from ~/prompt-machine directory

echo "🔐 Generating admin password hash..."

# Make sure we're in the right directory
cd ~/prompt-machine/api

# Generate the password hash directly
HASH=$(node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log(h)).catch(e=>console.error('Error:',e.message))")

if [ -z "$HASH" ]; then
    echo "❌ Failed to generate hash. Checking bcrypt installation..."
    npm list bcrypt
    echo ""
    echo "If bcrypt is not installed, run: npm install bcrypt"
    exit 1
fi

# Create the SQL update script
cat > ../scripts/update-admin-password.sql << EOF
-- Update admin password
-- Generated on $(date)
UPDATE users SET password_hash = '$HASH' WHERE email = 'admin@prompt-machine.com';
EOF

echo "✅ Password hash generated!"
echo ""
echo "Hash: $HASH"
echo ""
echo "SQL script saved to: scripts/update-admin-password.sql"
echo ""
echo "To update the admin password, run:"
echo "psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta -f ../scripts/update-admin-password.sql"
echo ""
echo "Default login will be:"
echo "Email: admin@prompt-machine.com"
echo "Password: Uhr4ryPWey"