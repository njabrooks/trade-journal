#!/bin/bash
# Generate PGP key for IBKR SFTP delivery

set -e

echo "🔐 Generating PGP key for IBKR SFTP delivery"
echo ""

# Check if GPG is installed
if ! command -v gpg &> /dev/null; then
    echo "❌ GPG is not installed. Please install it first:"
    echo "   brew install gnupg"
    exit 1
fi

# Create GPG directory if it doesn't exist
mkdir -p ~/.gnupg
chmod 700 ~/.gnupg

# Get email for key
EMAIL=$(git config user.email 2>/dev/null || echo "trade-journal@example.com")
echo "Using email: $EMAIL"
echo ""

# Generate key with batch mode
cat > /tmp/gpg_batch_config <<EOF
%no-protection
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: Trade Journal
Name-Email: $EMAIL
Expire-Date: 0
%commit
EOF

echo "Generating PGP key (this may take a minute)..."
gpg --batch --generate-key /tmp/gpg_batch_config

# Get the key ID - try different formats
KEY_ID=$(gpg --list-secret-keys --keyid-format LONG 2>/dev/null | grep -E "^sec|^sec#" | head -1 | awk '{print $2}' | awk -F'/' '{print $2}')

if [ -z "$KEY_ID" ]; then
    # Try alternative format
    KEY_ID=$(gpg --list-secret-keys --keyid-format LONG 2>/dev/null | grep -A 1 "^sec" | tail -1 | awk '{print $1}' | awk -F'/' '{print $2}')
fi

if [ -z "$KEY_ID" ]; then
    echo "❌ Could not extract key ID. Listing keys:"
    gpg --list-secret-keys --keyid-format LONG
    exit 1
fi

echo ""
echo "✅ PGP key generated successfully!"
echo ""
echo "Key ID: $KEY_ID"
echo ""

# Export public key
PUBLIC_KEY_FILE="ibkr_sftp_public_key.asc"
gpg --armor --export "$KEY_ID" > "$PUBLIC_KEY_FILE"

echo "📄 Public key exported to: $PUBLIC_KEY_FILE"
echo ""
echo "📋 Key Information:"
gpg --list-keys --keyid-format LONG "$KEY_ID"
echo ""
echo "🔑 Fingerprint:"
gpg --fingerprint "$KEY_ID" | grep -A 1 "^pub" | tail -1
echo ""
echo "📧 Next steps:"
echo "1. Send the public key file ($PUBLIC_KEY_FILE) to IBKR support"
echo "2. Provide them with:"
echo "   - Key ID: $KEY_ID"
echo "   - Fingerprint: $(gpg --fingerprint "$KEY_ID" | grep -A 1 "^pub" | tail -1 | sed 's/^[[:space:]]*//')"
echo "3. Request SFTP delivery setup for your Flex queries"
echo ""
echo "⚠️  Keep your private key secure! It's stored in ~/.gnupg/"
echo ""

