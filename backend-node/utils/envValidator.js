/**
 * Environment Variable Validator
 * Ensures the backend has all critical environment variables to run successfully in production.
 * Supports fallback naming conventions (e.g., AWS_ACCESS_KEY_ID vs AWS_ACCESS_KEY).
 */

function validateEnv() {
  console.log("\n==========================================");
  console.log("   ENVIRONMENT VARIABLE VALIDATION");
  console.log("==========================================");

  let hasErrors = false;

  // Helper to check and log a single or fallback variable
  function checkVar(primary, fallback = null, isCritical = true) {
    let value = process.env[primary];
    let using = primary;
    
    if (!value && fallback) {
      value = process.env[fallback];
      using = fallback;
    }

    if (value) {
      console.log(`✅ ${using} is set`);
    } else {
      if (isCritical) {
        console.error(`❌ CRITICAL: Missing ${primary}${fallback ? ` or ${fallback}` : ''}`);
        hasErrors = true;
      } else {
        console.warn(`⚠️ WARNING: Missing ${primary} (Optional)`);
      }
    }
    return value;
  }

  // 1. Database
  checkVar("MONGO_URI");

  // 2. AWS Credentials & Config
  // Ensure we set the primary variable if fallback is used so the rest of the app doesn't break
  const awsAccessKey = checkVar("AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY");
  if (awsAccessKey && !process.env.AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = awsAccessKey;
  }

  const awsSecretKey = checkVar("AWS_SECRET_ACCESS_KEY", "AWS_SECRET_KEY");
  if (awsSecretKey && !process.env.AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = awsSecretKey;
  }

  checkVar("AWS_REGION");
  
  const awsBucket = checkVar("AWS_S3_BUCKET", "AWS_BUCKET_NAME");
  if (awsBucket && !process.env.AWS_S3_BUCKET) {
    process.env.AWS_S3_BUCKET = awsBucket;
  }

  // 3. AI Worker
  checkVar("AI_WORKER_URL");

  // 4. JWT & Auth
  checkVar("JWT_SECRET");

  console.log("==========================================\n");

  if (hasErrors) {
    console.error("FATAL ERROR: Required environment variables are missing.");
    console.error("The server cannot start safely. Please fix the variables and restart.");
    process.exit(1); // Crash early instead of failing silently later
  }
}

module.exports = validateEnv;
