# IBKR SFTP Delivery Setup

This document contains information for setting up SFTP delivery of Flex query reports from Interactive Brokers.

## PGP Key Information

**Key ID:** `59416005D98863D9`  
**Fingerprint:** `F043 D442 551C F624 CCDD  9C40 5941 6005 D988 63D9`  
**Email:** `nick@twotrees.capital`  
**Public Key File:** `ibkr_sftp_public_key.asc`

## IBKR FTP Delivery Information

**Contact Email:** `filedelivery@interactivebrokers.com`

**Important Notes:**
- FTP delivery is available by request only (no cost)
- Encryption is **required** for FTP delivery (PGP)
- Encryption is optional for Email delivery
- If Email delivery is used without encryption, account details will be masked in the report

## Email Template for IBKR File Delivery

**To:** `filedelivery@interactivebrokers.com`  
**Subject:** Request for FTP Delivery of Flex Query Reports

---

Dear IBKR File Delivery Team,

I would like to request FTP delivery for my Flex query reports. Please configure FTP delivery for the following Flex queries:

**Flex Query IDs:**
- Positions Query: [YOUR_POSITIONS_QUERY_ID]
- Trades Query: [YOUR_TRADES_QUERY_ID]

**FTP/SFTP Server Details:**
- Host: [YOUR_FTP_HOST]
- Port: [TYPICALLY_21_FOR_FTP_OR_22_FOR_SFTP]
- Username: [YOUR_FTP_USERNAME]
- Password: [YOUR_FTP_PASSWORD] (if required)
- Directory: [OPTIONAL_PATH]
- Protocol: [FTP or SFTP]

**PGP Encryption (Required for FTP):**
I have attached my PGP public key file (`ibkr_sftp_public_key.asc`) for encryption of the delivered files as required.

**Key Information:**
- Key ID: `59416005D98863D9`
- Fingerprint: `F043 D442 551C F624 CCDD  9C40 5941 6005 D988 63D9`
- Email: `nick@twotrees.capital`

Please let me know if you need any additional information or if there are any specific requirements for the FTP setup.

Thank you,
[Your Name]

---

## Next Steps

1. **Get Supabase SFTP Details:**
   - Check Supabase dashboard for SFTP/Storage settings
   - Or set up SFTP server if using custom infrastructure
   - Note: Supabase Storage may not have direct SFTP - you might need to set up a separate SFTP server or use webhook/API approach

2. **Send Email to IBKR:**
   - Use the template above
   - Attach `ibkr_sftp_public_key.asc`
   - Fill in your Flex query IDs
   - Fill in your SFTP server details

3. **After IBKR Sets Up SFTP:**
   - Files will be delivered to your SFTP server
   - You'll need to set up a process to:
     - Monitor the SFTP directory for new files
     - Download and decrypt the files (using your private key)
     - Process them through the ingestion pipeline

## Alternative: Webhook/API Approach

If Supabase doesn't support direct SFTP, consider:
- Setting up a webhook endpoint that IBKR can POST to
- Using a service like Zapier/Make.com to receive SFTP files and forward to your API
- Setting up a small SFTP server (e.g., on a VPS) that forwards files to your ingestion API

## Processing SFTP Files

Once files are delivered via SFTP, you can process them using the existing ingestion endpoints:

```bash
# Example: Process a downloaded Flex CSV
curl -X POST http://localhost:3000/api/ingest/flex/positions-all \
  -F "file=@/path/to/downloaded/flex_report.csv"
```

Or create an automated script that:
1. Monitors SFTP directory
2. Downloads new files
3. Decrypts with PGP
4. Calls ingestion API
5. Archives processed files

