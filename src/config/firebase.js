import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Check if Firebase credentials are properly set
const hasRequiredCredentials = 
  process.env.FIREBASE_PROJECT_ID && 
  process.env.FIREBASE_PRIVATE_KEY && 
  process.env.FIREBASE_CLIENT_EMAIL;

if (hasRequiredCredentials) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `xpress-ai-new.firebasestorage.app`,
    });
  }
} else {
  console.warn("⚠️ Firebase credentials not fully configured. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.");
}

export const db = admin.apps.length > 0 ? admin.firestore() : null;
export const bucket = admin.apps.length > 0 ? admin.storage().bucket() : null;
