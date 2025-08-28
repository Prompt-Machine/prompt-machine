-- Check and create user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'promptmachine_userbeta') THEN
        CREATE USER promptmachine_userbeta WITH PASSWORD '94oE1q7K';
        RAISE NOTICE 'User promptmachine_userbeta created';
    ELSE
        RAISE NOTICE 'User promptmachine_userbeta already exists';
    END IF;
END$$;

-- Check and create database
SELECT 'Checking for database...' as status;
\set ON_ERROR_STOP off
CREATE DATABASE promptmachine_dbbeta OWNER promptmachine_userbeta;
\set ON_ERROR_STOP on

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE promptmachine_dbbeta TO promptmachine_userbeta;

-- Show result
\l promptmachine_dbbeta
\echo 'Database setup complete!'
