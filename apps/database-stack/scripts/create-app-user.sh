#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(dirname "$SCRIPT_DIR")"

command -v jq >/dev/null 2>&1 || {
    echo "Error: jq is required"
    exit 1
}

echo "Getting RDS configuration..."
cd "$STACK_DIR"
ENDPOINT=$(pulumi stack output endpoint)
DB_NAME=$(pulumi stack output dbName)
ADMIN_USER=$(pulumi config get rds:masterUsername)
ADMIN_PASS=$(pulumi config get rds:masterPassword)

echo ""
echo "Available control-plane stacks:"
cd "$STACK_DIR/../control-plane-stack"
STACKS=$(pulumi stack ls --json | jq -r '.[].name')
i=1
declare -a STACK_ARRAY
for stack in $STACKS; do
    echo "  $i) $stack"
    STACK_ARRAY[$i]=$stack
    ((i++))
done

read -p "Select stack number: " SELECTION
SELECTED_STACK=${STACK_ARRAY[$SELECTION]}

if [ -z "$SELECTED_STACK" ]; then
    echo "Invalid selection"
    exit 1
fi

echo "Using stack: $SELECTED_STACK"
pulumi stack select "$SELECTED_STACK" --non-interactive

NODE_ID=$(pulumi config get controlPlane:nodeId)
APP_USER="control_plane_${NODE_ID}"
APP_PASS=$(pulumi config get database:password)
ADMIN_PASS_ESCAPED="${ADMIN_PASS//\'/\'\'}"
APP_PASS_ESCAPED="${APP_PASS//\'/\'\'}"

echo ""
echo "Creating user '$APP_USER' on $ENDPOINT via control-plane SSH..."

"$STACK_DIR/../../bin/ssh-to-host" 0 "PGPASSWORD='$ADMIN_PASS_ESCAPED' psql -h '$ENDPOINT' -U '$ADMIN_USER' -d '$DB_NAME' <<'EOSQL'
-- Create application user (idempotent)
DO \$\$
BEGIN
  CREATE USER $APP_USER WITH PASSWORD '$APP_PASS_ESCAPED';
EXCEPTION WHEN duplicate_object THEN
  ALTER USER $APP_USER WITH PASSWORD '$APP_PASS_ESCAPED';
END
\$\$;

-- Grant connect
GRANT CONNECT ON DATABASE $DB_NAME TO $APP_USER;

-- Grant full schema privileges (needed for migrations)
GRANT ALL ON SCHEMA public TO $APP_USER;

-- Grant all privileges on existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $APP_USER;

-- Grant all privileges on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO $APP_USER;

-- Grant all privileges on sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $APP_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO $APP_USER;

-- Grant pgboss schema privileges (if exists)
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss') THEN
    EXECUTE 'GRANT ALL ON SCHEMA pgboss TO $APP_USER';
    EXECUTE 'ALTER SCHEMA pgboss OWNER TO $APP_USER';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA pgboss TO $APP_USER';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA pgboss TO $APP_USER';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON TABLES TO $APP_USER';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON SEQUENCES TO $APP_USER';
  END IF;
END
\$\$;

\\echo 'User created successfully'
EOSQL
"
echo "User '$APP_USER' can now connect to $DB_NAME"
