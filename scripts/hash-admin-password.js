// This script must be run from the api directory where bcrypt is installed
const bcrypt = require('bcrypt');

async function hashPassword() {
    const password = 'Uhr4ryPWey'; // Default admin password
    const hash = await bcrypt.hash(password, 10);
    
    console.log('\n===========================================');
    console.log('Admin Password Hash Generated!');
    console.log('===========================================\n');
    console.log('Copy this SQL and run it:\n');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@prompt-machine.com';`);
    console.log('\n===========================================');
    console.log('Default login credentials:');
    console.log('Email: admin@prompt-machine.com');
    console.log('Password: Uhr4ryPWey');
    console.log('\n⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN!');
    console.log('===========================================\n');
}

hashPassword().catch(console.error);
